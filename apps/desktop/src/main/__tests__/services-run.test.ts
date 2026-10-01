import { afterEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { SecretEvent } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentResponse } from "@shared/agent";
import {
  CONNECTION_LABEL,
  carriesCredential,
  databaseEngineOf,
} from "@shared/services";
import {
  credentialValue,
  declaresService,
  forgetCredentials,
  forgetServices,
  noteServices,
  readDatabaseUrl,
  readService,
  type ServicesDeps,
  servicePath,
} from "../services-run";

const SERVER = "srv-1";

const PASSWORD = "s3cr3t-de-la-base";

const URL = `postgresql://remote:${PASSWORD}@127.0.0.1:5432/flyleaf`;

type Sent = { cmd: CommandName; params: unknown };

function agent(
  answers: Partial<Record<CommandName, unknown>>,
  env: Record<string, string> = {}
): {
  deps: ServicesDeps;
  sent: Sent[];
} {
  const sent: Sent[] = [];

  const deps: ServicesDeps = {
    client: {
      request: (
        _serverId: string,
        cmd: CommandName,
        params?: unknown,
        options?: { onSecret?: (secret: SecretEvent) => void }
      ): Promise<AgentResponse<never>> => {
        sent.push({ cmd, params });

        if (cmd === "service.secret") {
          const key = (params as { key: string }).key;
          const value = env[key];

          if (value === undefined) {
            return Promise.resolve({
              error: { code: "bad_request", message: `${key} inconnue` },
              ok: false,
            });
          }

          options?.onSecret?.({ event: "secret", id: 1, key, value });

          return Promise.resolve({
            ok: true,
            result: { key },
          } as AgentResponse<never>);
        }

        const result = answers[cmd];

        return Promise.resolve(
          result === undefined
            ? {
                ok: false,
                error: { code: "unknown_command", message: `${cmd} inconnue` },
              }
            : ({ ok: true, result } as AgentResponse<never>)
        );
      },
    } as ServicesDeps["client"],
    declares: (serverId, moduleId) =>
      serverId === SERVER && ["db.postgres", "tool.github"].includes(moduleId),
    knows: (serverId) => serverId === SERVER,
  };

  return { deps, sent };
}

const APP_KEY = "POSTGRES_APP_PASSWORD";

const ENV = { [APP_KEY]: PASSWORD };

const STATUS = {
  credentials: {
    "Rôle applicatif": APP_KEY,
    "Rôle distant": "POSTGRES_REMOTE_PASSWORD",
  },
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  state: "running",
  unit: "postgresql.service",
  version: "17.2",
};

afterEach(() => {
  forgetCredentials();
});

describe("a service's state", () => {
  it("returns what the agent said about the machine", async () => {
    const { deps, sent } = agent({ "service.status": STATUS });

    const answer = await readService(SERVER, "db.postgres", deps);

    expect(sent).toEqual([
      { cmd: "service.status", params: { id: "db.postgres" } },
    ]);
    expect(answer.ok && answer.result.state).toBe("running");
    expect(answer.ok && answer.result.port).toBe(5432);
    expect(answer.ok && answer.result.unit).toBe("postgresql.service");
    expect(answer.ok && answer.result.version).toBe("17.2");
  });

  it("returns what the CLI says about its account, and nothing when it has none", async () => {
    const signed = agent({
      "service.status": {
        ...STATUS,
        id: "tool.github",
        login: { account: "flyleaf", state: "signed_in" },
      },
    });

    const answer = await readService(SERVER, "tool.github", signed.deps);

    expect(answer.ok && answer.result.login).toEqual({
      account: "flyleaf",
      state: "signed_in",
    });

    const plain = agent({ "service.status": STATUS });

    const silent = await readService(SERVER, "db.postgres", plain.deps);

    expect(silent.ok && "login" in silent.result).toBe(false);
  });

  it("names the credentials without delivering a single one", async () => {
    const { deps } = agent({ "service.status": STATUS });

    const answer = await readService(SERVER, "db.postgres", deps);

    expect(answer.ok && answer.result.credentials).toEqual([
      "Rôle applicatif",
      "Rôle distant",
    ]);
    expect(JSON.stringify(answer)).not.toContain(PASSWORD);
  });

  it("fetches the value on demand, one key at a time", async () => {
    const { deps, sent } = agent({ "service.status": STATUS }, ENV);

    await readService(SERVER, "db.postgres", deps);

    expect(
      await credentialValue(SERVER, "db.postgres", "Rôle applicatif", deps)
    ).toBe(PASSWORD);
    expect(sent.at(-1)).toEqual({
      cmd: "service.secret",
      params: { id: "db.postgres", key: APP_KEY },
    });
    expect(
      await credentialValue(SERVER, "db.postgres", "Inventé", deps)
    ).toBeNull();
    expect(
      await credentialValue("srv-2", "db.postgres", "Rôle applicatif", deps)
    ).toBeNull();
  });

  it("forgets them with the server", async () => {
    const { deps } = agent({ "service.status": STATUS }, ENV);

    await readService(SERVER, "db.postgres", deps);
    forgetCredentials(SERVER);

    expect(
      await credentialValue(SERVER, "db.postgres", "Rôle applicatif", deps)
    ).toBeNull();
  });

  it("refuses a server that is no longer in the list", async () => {
    const { deps, sent } = agent({ "service.status": STATUS });

    const answer = await readService("srv-inconnu", "db.postgres", deps);

    expect(answer.ok).toBe(false);
    expect(sent).toEqual([]);
  });

  it("refuses a service the agent did not list, asking it nothing", async () => {
    const { deps, sent } = agent({ "service.status": STATUS });

    const answer = await readService(SERVER, "db.inventé", deps);

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "service_not_found",
        phrase: {
          id: "refusal.service.unknown",
          values: { service: "db.inventé" },
        },
      },
    });
    expect(sent).toEqual([]);
  });
});

describe("the services the agent listed", () => {
  afterEach(() => {
    forgetServices();
  });

  it("retains what a snapshot or a status listed, and nothing else", () => {
    expect(declaresService(SERVER, "db.postgres")).toBe(false);

    noteServices(SERVER, "snapshot", {
      ok: true,
      result: {
        services: [
          { id: "db.postgres" },
          { id: "runtime.node" },
          { id: "editor.jetbrains", path: "/home/dev/.cache/dist/idea" },
          { id: "editor.zed", path: "relative/never" },
        ],
      },
    });

    expect(declaresService(SERVER, "db.postgres")).toBe(true);
    expect(declaresService(SERVER, "runtime.node")).toBe(true);
    expect(declaresService(SERVER, "db.mysql")).toBe(false);
    expect(declaresService("srv-2", "db.postgres")).toBe(false);
    expect(servicePath(SERVER, "editor.jetbrains")).toBe(
      "/home/dev/.cache/dist/idea"
    );
    expect(servicePath(SERVER, "editor.zed")).toBeNull();
    expect(servicePath(SERVER, "db.postgres")).toBeNull();

    noteServices(SERVER, "status", {
      ok: true,
      result: { services: [{ id: "db.mysql" }] },
    });

    expect(declaresService(SERVER, "db.postgres")).toBe(false);
    expect(declaresService(SERVER, "db.mysql")).toBe(true);
  });

  it("ignores a response that does not list the services", () => {
    noteServices(SERVER, "service.status", {
      ok: true,
      result: { id: "db.postgres" },
    });
    noteServices(SERVER, "snapshot", {
      ok: false,
      error: { code: "disconnected", message: "coupé" },
    });

    expect(declaresService(SERVER, "db.postgres")).toBe(false);
  });

  it("is forgotten with the server", () => {
    noteServices(SERVER, "snapshot", {
      ok: true,
      result: { services: [{ id: "db.postgres" }] },
    });

    forgetServices(SERVER);

    expect(declaresService(SERVER, "db.postgres")).toBe(false);
  });
});

describe("a database's connection URL", () => {
  it("infers the engine from the module id", async () => {
    const { deps, sent } = agent({ "db.url": { url: URL } });

    const answer = await readDatabaseUrl(SERVER, "db.postgres", null, deps);

    expect(sent).toEqual([{ cmd: "db.url", params: { engine: "postgres" } }]);
    expect(answer.ok && answer.result.label).toBe(CONNECTION_LABEL);
    expect(JSON.stringify(answer)).not.toContain(PASSWORD);
  });

  it("files it with the module's other credentials", async () => {
    const { deps } = agent({ "db.url": { url: URL } });

    await readDatabaseUrl(SERVER, "db.postgres", "flyleaf", deps);

    expect(
      await credentialValue(SERVER, "db.postgres", CONNECTION_LABEL, deps)
    ).toBe(URL);
  });

  it("refuses a module that is not a database", async () => {
    const { deps, sent } = agent({ "db.url": { url: URL } });

    const answer = await readDatabaseUrl(SERVER, "runtime.node", null, deps);

    expect(answer.ok).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("a revealed credential", () => {
  it("appears in no line written by the app", async () => {
    const written: string[] = [];
    const kept = { error: console.error, log: console.log, warn: console.warn };

    console.log = (...parts: unknown[]) => written.push(parts.join(" "));
    console.warn = console.log;
    console.error = console.log;

    try {
      const { deps } = agent(
        { "db.url": { url: URL }, "service.status": STATUS },
        ENV
      );

      const detail = await readService(SERVER, "db.postgres", deps);
      await readDatabaseUrl(SERVER, "db.postgres", null, deps);

      const shown = await credentialValue(
        SERVER,
        "db.postgres",
        CONNECTION_LABEL,
        deps
      );

      expect(shown).toBe(URL);
      expect(written.join("\n")).not.toContain(PASSWORD);
      expect(JSON.stringify(detail)).not.toContain(PASSWORD);
    } finally {
      console.error = kept.error;
      console.log = kept.log;
      console.warn = kept.warn;
    }
  });
});

describe("what does not go through the generic bridge", () => {
  it("names the commands that respond with a credential", () => {
    expect(carriesCredential("service.status")).toBe(true);
    expect(carriesCredential("db.url")).toBe(true);
    expect(carriesCredential("snapshot")).toBe(false);
  });

  it("reads the engine from the module id, with no app-side table", () => {
    expect(databaseEngineOf("db.mongodb")).toBe("mongodb");
    expect(databaseEngineOf("db.postgres")).toBe("postgres");
    expect(databaseEngineOf("db.redis")).toBeNull();
    expect(databaseEngineOf("runtime.node")).toBeNull();
  });
});
