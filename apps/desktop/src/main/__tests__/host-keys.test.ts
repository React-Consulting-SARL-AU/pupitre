import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ed25519Of,
  hostKeyDecision,
  keyLines,
  liveKeys,
  REINSTALLED_ACTION,
  recordHostKey,
} from "../host-keys";
import { appSshPaths } from "../ssh-config";

const PINNED = "SHA256:5ZmC0Tn0eYxJ0nR1cLcQK1a7q0mCq0k9YkGqiJ2b3Xk";
const OTHER = "SHA256:t9bB1v2n3M4c5X6z7A8s9D0f1G2h3J4k5L6m7N8o9P0";

describe("la décision sur la clé d'hôte", () => {
  it("appelle premier contact ce qui n'a jamais été épinglé", () => {
    expect(hostKeyDecision(undefined, null)).toEqual({
      status: "first_contact",
    });
    expect(hostKeyDecision(undefined, PINNED)).toEqual({
      status: "first_contact",
    });
  });

  it("fait confiance à l'empreinte qui n'a pas bougé", () => {
    expect(hostKeyDecision(PINNED, PINNED)).toEqual({
      fingerprint: PINNED,
      status: "trusted",
    });
  });

  it("refuse la connexion quand l'empreinte a changé, en disant laquelle", () => {
    const decision = hostKeyDecision(PINNED, OTHER);

    expect(decision.status).toBe("changed");
    if (decision.status !== "changed") {
      return;
    }
    expect(decision.expected).toBe(PINNED);
    expect(decision.observed).toBe(OTHER);
    expect(decision.phrase.id).toBe("refusal.hostKey.changed");
  });

  it("refuse aussi quand l'empreinte épinglée a disparu du fichier de l'app", () => {
    const decision = hostKeyDecision(PINNED, null);

    expect(decision.status).toBe("changed");
    if (decision.status === "changed") {
      expect(decision.observed).toBe(null);
    }
  });

  it("croit la machine telle qu'elle répond aujourd'hui plutôt que le fichier de l'app", () => {
    expect(hostKeyDecision(PINNED, PINNED, [OTHER])).toMatchObject({
      expected: PINNED,
      observed: OTHER,
      status: "changed",
    });
    expect(hostKeyDecision(PINNED, PINNED, ["SHA256:rsa", PINNED])).toEqual({
      fingerprint: PINNED,
      status: "trusted",
    });
    expect(hostKeyDecision(PINNED, PINNED, [])).toEqual({
      fingerprint: PINNED,
      status: "trusted",
    });
  });

  it("propose de remplacer l'empreinte, et rien d'autre", () => {
    const decision = hostKeyDecision(PINNED, OTHER);

    if (decision.status !== "changed") {
      throw new Error("attendu : changed");
    }
    expect(decision.actions).toEqual([REINSTALLED_ACTION, "cancel"]);
  });
});

describe("l'empreinte Ed25519 que l'enrôlement épingle", () => {
  it("prend la ligne Ed25519 de known_hosts, quelle que soit sa place", () => {
    expect(
      ed25519Of(
        [
          "# Host [vps.test]:2222 found: line 1 ",
          `[vps.test]:2222 ECDSA ${OTHER}`,
          "# Host [vps.test]:2222 found: line 2 ",
          `[vps.test]:2222 ED25519 ${PINNED}`,
        ].join("\n")
      )
    ).toBe(PINNED);
  });

  it("ne rend rien quand ssh s'est entendu sur un autre type", () => {
    expect(ed25519Of(`vps.test ECDSA ${OTHER}\n`)).toBeNull();
  });
});

describe("la clé que la machine présente", () => {
  const ED25519 =
    "203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPb/g4KaAWwmJ+dUR3ZBxx6lMSo4i0mR7vaMD2qkuRGH";

  it("garde les lignes de clé, pas les commentaires de ssh-keyscan", () => {
    expect(
      keyLines(`# 203.0.113.10:22 SSH-2.0-OpenSSH_9.6\n${ED25519}\n\n`)
    ).toEqual([ED25519]);
  });

  it("apparie chaque ligne à son empreinte", async () => {
    const keys = await liveKeys(
      { host: "203.0.113.10", port: 22 },
      async () => `# banner\n${ED25519}\n`
    );

    expect(keys).toHaveLength(1);
    expect(keys[0]?.line).toBe(ED25519);
    expect(keys[0]?.fingerprint).toMatch(/^SHA256:/);
  });

  it("ne présente rien quand la machine ne répond pas", async () => {
    const keys = await liveKeys(
      { host: "203.0.113.10", port: 22 },
      async () => {
        throw new Error("timeout");
      }
    );

    expect(keys).toEqual([]);
  });

  it("s'écrit dans le fichier de l'app, à la suite de ce qu'il tient", () => {
    const dir = mkdtempSync(join(tmpdir(), "pupitre-known-"));
    const paths = appSshPaths(dir, join(dir, "home"));

    mkdirSync(paths.dir, { recursive: true });
    recordHostKey(ED25519, paths);
    expect(readFileSync(paths.knownHostsPath, "utf8")).toBe(`${ED25519}\n`);
    expect(statSync(paths.knownHostsPath).mode & 0o777).toBe(0o600);

    writeFileSync(paths.knownHostsPath, "[10.0.0.1]:2222 ssh-ed25519 AAAA");
    recordHostKey(ED25519, paths);
    expect(readFileSync(paths.knownHostsPath, "utf8")).toBe(
      `[10.0.0.1]:2222 ssh-ed25519 AAAA\n${ED25519}\n`
    );

    rmSync(dir, { force: true, recursive: true });
  });
});
