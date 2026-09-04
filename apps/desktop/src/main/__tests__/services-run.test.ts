import { afterEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AgentResponse } from "@shared/agent";
import {
  CONNECTION_LABEL,
  carriesCredential,
  databaseEngineOf,
} from "@shared/services";
import {
  credentialValue,
  forgetCredentials,
  readDatabaseUrl,
  readService,
  type ServicesDeps,
} from "../services-run";

const SERVER = "srv-1";

const PASSWORD = "s3cr3t-de-la-base";

const URL = `postgresql://remote:${PASSWORD}@127.0.0.1:5432/flymate`;

type Sent = { cmd: CommandName; params: unknown };

function agent(answers: Partial<Record<CommandName, unknown>>): {
  deps: ServicesDeps;
  sent: Sent[];
} {
  const sent: Sent[] = [];

  const deps: ServicesDeps = {
    client: {
      request: (
        _serverId: string,
        cmd: CommandName,
        params?: unknown
      ): Promise<AgentResponse<never>> => {
        sent.push({ cmd, params });

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
    knows: (serverId) => serverId === SERVER,
  };

  return { deps, sent };
}

const STATUS = {
  credentials: {
    "Rôle applicatif": PASSWORD,
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

describe("l'état d'un service", () => {
  it("rend ce que l'agent a dit de la machine", async () => {
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

  it("nomme les identifiants sans en livrer un seul", async () => {
    const { deps } = agent({ "service.status": STATUS });

    const answer = await readService(SERVER, "db.postgres", deps);

    expect(answer.ok && answer.result.credentials).toEqual([
      "Rôle applicatif",
      "Rôle distant",
    ]);
    expect(JSON.stringify(answer)).not.toContain(PASSWORD);
  });

  it("les garde de son côté, un à la fois, pour qui les demande", async () => {
    const { deps } = agent({ "service.status": STATUS });

    await readService(SERVER, "db.postgres", deps);

    expect(credentialValue(SERVER, "db.postgres", "Rôle applicatif")).toBe(
      PASSWORD
    );
    expect(credentialValue(SERVER, "db.postgres", "Inventé")).toBeNull();
    expect(
      credentialValue("srv-2", "db.postgres", "Rôle applicatif")
    ).toBeNull();
  });

  it("les oublie avec le serveur", async () => {
    const { deps } = agent({ "service.status": STATUS });

    await readService(SERVER, "db.postgres", deps);
    forgetCredentials(SERVER);

    expect(
      credentialValue(SERVER, "db.postgres", "Rôle applicatif")
    ).toBeNull();
  });

  it("refuse un serveur qui n'est plus dans la liste", async () => {
    const { deps, sent } = agent({ "service.status": STATUS });

    const answer = await readService("srv-inconnu", "db.postgres", deps);

    expect(answer.ok).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("l'URL de connexion d'une base", () => {
  it("déduit le moteur de l'identifiant du module", async () => {
    const { deps, sent } = agent({ "db.url": { url: URL } });

    const answer = await readDatabaseUrl(SERVER, "db.postgres", null, deps);

    expect(sent).toEqual([{ cmd: "db.url", params: { engine: "postgres" } }]);
    expect(answer.ok && answer.result.label).toBe(CONNECTION_LABEL);
    expect(JSON.stringify(answer)).not.toContain(PASSWORD);
  });

  it("la range avec les autres identifiants du module", async () => {
    const { deps } = agent({ "db.url": { url: URL } });

    await readDatabaseUrl(SERVER, "db.postgres", "flymate", deps);

    expect(credentialValue(SERVER, "db.postgres", CONNECTION_LABEL)).toBe(URL);
  });

  it("refuse un module qui n'est pas une base", async () => {
    const { deps, sent } = agent({ "db.url": { url: URL } });

    const answer = await readDatabaseUrl(SERVER, "runtime.node", null, deps);

    expect(answer.ok).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("un identifiant révélé", () => {
  it("n'apparaît dans aucune ligne écrite par l'app", async () => {
    const written: string[] = [];
    const kept = { error: console.error, log: console.log, warn: console.warn };

    console.log = (...parts: unknown[]) => written.push(parts.join(" "));
    console.warn = console.log;
    console.error = console.log;

    try {
      const { deps } = agent({
        "db.url": { url: URL },
        "service.status": STATUS,
      });

      const detail = await readService(SERVER, "db.postgres", deps);
      await readDatabaseUrl(SERVER, "db.postgres", null, deps);

      const shown = credentialValue(SERVER, "db.postgres", CONNECTION_LABEL);

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

describe("ce qui ne passe pas par le pont générique", () => {
  it("nomme les commandes qui répondent avec un identifiant", () => {
    expect(carriesCredential("service.status")).toBe(true);
    expect(carriesCredential("db.url")).toBe(true);
    expect(carriesCredential("snapshot")).toBe(false);
  });

  it("lit le moteur dans l'identifiant du module, sans table de l'app", () => {
    expect(databaseEngineOf("db.mongodb")).toBe("mongodb");
    expect(databaseEngineOf("db.postgres")).toBe("postgres");
    expect(databaseEngineOf("db.redis")).toBeNull();
    expect(databaseEngineOf("runtime.node")).toBeNull();
  });
});
