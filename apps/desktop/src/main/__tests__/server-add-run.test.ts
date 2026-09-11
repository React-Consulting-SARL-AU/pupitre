import { describe, expect, it } from "bun:test";
import type { AgentResponse } from "@shared/agent";
import type { KeyInstall, Server, ServerDraft } from "@shared/servers";
import { addServerRun } from "../server-add-run";
import { type ServerCreation, SetupError } from "../server-setup";

const SERVER: Server = {
  host: "203.0.113.10",
  id: "srv-a",
  keyPath: "/keys/srv-a",
  name: "Atelier",
  origin: "app",
  port: 22,
  user: "root",
};

const PUBLIC_KEY = "ssh-ed25519 AAAA pupitre srv-a";

const CREATED: ServerCreation = {
  copyId: "ssh-copy-id -i /keys/srv-a.pub root@203.0.113.10",
  publicKey: PUBLIC_KEY,
  server: SERVER,
  servers: [SERVER],
};

const DRAFT: ServerDraft = {
  host: "203.0.113.10",
  key: { mode: "generate" },
  name: "Atelier",
  port: 22,
  user: "root",
};

const CONFIG = { active: "srv-a", servers: [SERVER] };

function run(
  draft: ServerDraft,
  {
    created = Promise.resolve(CREATED),
    installed = { ok: true, result: { installed: true, status: "opened" } },
  }: {
    created?: Promise<ServerCreation>;
    installed?: AgentResponse<KeyInstall>;
  } = {}
) {
  const removed: string[] = [];
  const installs: { server: Server; publicKey: string; password: string }[] =
    [];

  return {
    answer: addServerRun(draft, {
      add: () => created,
      config: () => CONFIG,
      install: (server, publicKey, password) => {
        installs.push({ password, publicKey, server });

        return Promise.resolve(installed);
      },
      remove: (id) => {
        removed.push(id);

        return Promise.resolve();
      },
    }),
    installs,
    removed,
  };
}

describe("l'ajout d'un serveur avec son mot de passe", () => {
  it("ajoute sans rien poser quand aucun mot de passe n'est venu", async () => {
    const { answer, installs } = run(DRAFT);

    expect(await answer).toEqual({
      ok: true,
      result: {
        config: CONFIG,
        copyId: CREATED.copyId,
        keyInstall: null,
        publicKey: CREATED.publicKey,
        server: SERVER,
      },
    });
    expect(installs).toHaveLength(0);
  });

  it("pose la clé qui vient d'être faite avec le mot de passe, dans le même geste", async () => {
    const { answer, installs, removed } = run({
      ...DRAFT,
      password: "hunter2",
    });

    expect(await answer).toMatchObject({
      ok: true,
      result: { keyInstall: { installed: true, status: "opened" } },
    });
    expect(installs).toEqual([
      { password: "hunter2", publicKey: PUBLIC_KEY, server: SERVER },
    ]);
    expect(removed).toEqual([]);
  });

  it("ne crée rien quand la machine refuse le mot de passe, et le dit au formulaire", async () => {
    const { answer, removed } = run(
      { ...DRAFT, password: "wrong" },
      { installed: { ok: true, result: { retry: true, status: "password" } } }
    );

    expect(await answer).toEqual({
      ok: false,
      error: {
        code: "bad_request",
        message: "refusal.setup.password",
        phrase: {
          id: "refusal.setup.password",
          values: { host: "203.0.113.10", user: "root" },
        },
      },
    });
    expect(removed).toEqual(["srv-a"]);
  });

  it("garde le serveur et la raison quand la clé n'a pas pu être posée autrement", async () => {
    const manual: KeyInstall = {
      phrase: { id: "refusal.keyInstall.hostKey" },
      status: "manual",
    };
    const { answer, removed } = run(
      { ...DRAFT, password: "hunter2" },
      { installed: { ok: true, result: manual } }
    );

    expect(await answer).toMatchObject({
      ok: true,
      result: { keyInstall: manual },
    });
    expect(removed).toEqual([]);
  });

  it("ne pose rien sur un hôte du système, mot de passe ou non", async () => {
    const { answer, installs } = run(
      { ...DRAFT, key: { host: "vps", mode: "system" }, password: "hunter2" },
      {
        created: Promise.resolve({
          ...CREATED,
          copyId: null,
          publicKey: null,
        }),
      }
    );

    expect(await answer).toMatchObject({
      ok: true,
      result: { keyInstall: null, publicKey: null },
    });
    expect(installs).toHaveLength(0);
  });

  it("rend le refus de la création tel quel", async () => {
    const { answer } = run(DRAFT, {
      created: Promise.reject(
        new SetupError("refusal.setup.host", { host: "not a host" })
      ),
    });

    expect(await answer).toEqual({
      ok: false,
      error: {
        code: "bad_request",
        message: "refusal.setup.host",
        phrase: { id: "refusal.setup.host", values: { host: "not a host" } },
      },
    });
  });
});
