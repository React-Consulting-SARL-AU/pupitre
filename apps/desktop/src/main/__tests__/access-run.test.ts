import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessKeyId } from "@pupitre/shared/agent-protocol/access";
import type { AgentResponse } from "@shared/agent";
import {
  type AccessDeps,
  copyKey,
  createKey,
  hashOf,
  heldKeys,
  newKey,
  openAddress,
  revokeKey,
} from "../access-run";
import { createAccessVault } from "../access-vault";

const SERVER = "srv-1";

const SEALER = {
  available: () => true,
  decrypt: (value: Buffer) =>
    value.toString("utf8").split("").reverse().join(""),
  encrypt: (value: string) =>
    Buffer.from(value.split("").reverse().join(""), "utf8"),
};

interface Sent {
  cmd: string;
  params: Record<string, unknown>;
}

function setup(answer?: (sent: Sent) => AgentResponse<unknown>) {
  const sent: Sent[] = [];
  const opened: string[] = [];
  const copied: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "pupitre-access-"));
  const vault = createAccessVault({ dir, sealer: SEALER });

  const deps: AccessDeps = {
    copy: (text) => copied.push(text),
    deviceName: () => "atelier",
    guardedBy: (_serverId, hostname) =>
      hostname === "shop.example.org" ? "shop" : null,
    knows: (serverId) => serverId === SERVER,
    open: (url) => opened.push(url),
    request: (_serverId, cmd, params) => {
      const call = { cmd, params };

      sent.push(call);

      return Promise.resolve(
        answer?.(call) ?? {
          ok: true,
          result: {
            created_at: "2026-09-27T10:00:00Z",
            id: params.id,
            name: params.name,
            projects: params.projects,
          },
        }
      );
    },
    vault,
  };

  return { copied, deps, dir, opened, sent, vault };
}

describe("les clés d'accès", () => {
  it("tire une clé au format du portier", () => {
    const { id, key } = newKey();

    expect(key).toMatch(/^ppk_[a-z0-9]{12}_[a-z0-9]{32}$/);
    expect(accessKeyId(key)).toBe(id);
  });

  it("n'envoie au serveur que l'empreinte, et garde la clé sur cet ordinateur", async () => {
    const { deps, sent, vault } = setup();

    const created = await createKey(
      SERVER,
      "  Simulateur iOS ",
      ["shop"],
      deps
    );

    expect(created.ok).toBe(true);

    const params = sent[0]?.params ?? {};
    const kept = vault.key(SERVER, String(params.id));

    expect(params.name).toBe("Simulateur iOS");
    expect(JSON.stringify(params)).not.toContain("ppk_");
    expect(kept).not.toBeNull();
    expect(params.hash).toBe(hashOf(kept ?? ""));
  });

  it("refuse une clé sans nom ou sans projet, sans rien envoyer", async () => {
    const { deps, sent } = setup();

    expect((await createKey(SERVER, " ", null, deps)).ok).toBe(false);
    expect((await createKey(SERVER, "x", [], deps)).ok).toBe(false);
    expect((await createKey("other", "x", null, deps)).ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("ne garde rien d'une clé que le serveur a refusée", async () => {
    const { deps, vault } = setup(() => ({
      error: { code: "privilege_required", message: "no" },
      ok: false,
    }));

    await createKey(SERVER, "x", null, deps);

    expect(vault.held(SERVER)).toEqual([]);
  });

  it("copie un lien vers une adresse protégée seulement", async () => {
    const { copied, deps, sent } = setup();

    await createKey(SERVER, "recette", ["shop"], deps);
    const id = String(sent[0]?.params.id);

    expect(copyKey(SERVER, id, "link", "shop.example.org", deps).ok).toBe(true);
    expect(copied[0]).toMatch(
      /^https:\/\/shop\.example\.org\/\?pupitre_key=ppk_/
    );

    expect(copyKey(SERVER, id, "link", "evil.example", deps).ok).toBe(false);

    copyKey(SERVER, id, "header", null, deps);
    expect(copied[1]).toMatch(/^Pupitre-Key: ppk_/);
  });

  it("ne copie pas une clé créée sur un autre ordinateur", () => {
    const { deps } = setup();

    const refused = copyKey(SERVER, "abcdef012345", "key", null, deps);

    expect(refused.ok).toBe(false);
    expect(refused.ok ? null : refused.error.phrase?.id).toBe(
      "refusal.access.elsewhere"
    );
  });

  it("ouvre une adresse protégée avec la clé de cet ordinateur, tirée une fois", async () => {
    const { deps, opened, sent } = setup();

    await openAddress(SERVER, "https://shop.example.org/cart?ref=x#top", deps);
    await openAddress(SERVER, "https://shop.example.org/", deps);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.params.name).toBe("atelier");
    expect(sent[0]?.params.projects).toBeNull();
    expect(opened[0]).toMatch(
      /^https:\/\/shop\.example\.org\/cart\?ref=x&pupitre_key=ppk_[a-z0-9_]+#top$/
    );
    expect(opened[1]).toMatch(/^https:\/\/shop\.example\.org\/\?pupitre_key=/);
  });

  it("ouvre telle quelle une adresse que rien ne protège", async () => {
    const { deps, opened, sent } = setup();

    await openAddress(SERVER, "https://hooks.example.org/x?y=1", deps);

    expect(opened).toEqual(["https://hooks.example.org/x?y=1"]);
    expect(sent).toHaveLength(0);
  });

  it("n'ouvre qu'une adresse https", async () => {
    const { deps, opened } = setup();

    expect((await openAddress(SERVER, "file:///etc/passwd", deps)).ok).toBe(
      false
    );
    expect(opened).toHaveLength(0);
  });

  it("oublie une clé révoquée, ici ou depuis un autre ordinateur", async () => {
    const { deps, sent, vault } = setup();

    await createKey(SERVER, "a", null, deps);
    await createKey(SERVER, "b", null, deps);
    const [first, second] = sent.map((call) => String(call.params.id));

    await revokeKey(SERVER, first, deps);
    expect(vault.held(SERVER)).toEqual([String(second)]);

    const held = heldKeys(SERVER, [], deps);
    expect(held.ok ? held.result.held : null).toEqual([]);
  });

  it("retrouve ses clés au lancement suivant, scellées sur le disque", async () => {
    const { deps, dir, sent } = setup();

    await openAddress(SERVER, "https://shop.example.org/", deps);

    const reopened = createAccessVault({ dir, sealer: SEALER });
    const id = String(sent[0]?.params.id);

    expect(reopened.key(SERVER, id)).toMatch(/^ppk_/);
    expect(reopened.deviceKey(SERVER)).toBe(reopened.key(SERVER, id));
  });
});
