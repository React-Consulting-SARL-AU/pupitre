import { beforeEach, describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentResponse } from "@shared/agent";
import type { ServiceDetail } from "@shared/services";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useServices } from "../services";

const SERVER = "srv-1";

const PASSWORD = "mot-de-passe-de-la-base";

const DETAIL: ServiceDetail = {
  configured: true,
  credentials: ["Rôle applicatif", "Rôle distant"],
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  state: "running",
  unit: "postgresql.service",
  version: "17.2",
};

function step(
  module: string,
  name: string,
  status: "start" | "ok" | "fail",
  ms: number
): Event {
  return { id: 3, event: "step", module, step: name, status, ms } as Event;
}

beforeEach(() => {
  useServices.getState().forget();
});

describe("la fiche d'un service", () => {
  it("montre ce que le processus principal a bien voulu en dire", async () => {
    stubPupitre({
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");

    const { detail } = useServices.getState();

    expect(detail.status).toBe("ready");
    expect(detail.status === "ready" && detail.detail.port).toBe(5432);
  });

  it("ne garde jamais la valeur d'un identifiant révélé", async () => {
    const asked: string[] = [];

    stubPupitre({
      revealCredential: (_server, _module, label) => {
        asked.push(label);

        return Promise.resolve(PASSWORD);
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");

    const shown = await useServices
      .getState()
      .reveal(SERVER, "db.postgres", "Rôle applicatif");

    expect(shown).toBe(PASSWORD);
    expect(asked).toEqual(["Rôle applicatif"]);
    expect(JSON.stringify(useServices.getState())).not.toContain(PASSWORD);
  });

  it("fait copier de l'autre côté du pont", async () => {
    const copied: string[] = [];

    stubPupitre({
      copyCredential: (_server, _module, label) => {
        copied.push(label);

        return Promise.resolve(true);
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    const done = await useServices
      .getState()
      .copy(SERVER, "db.postgres", "Rôle distant");

    expect(done).toBe(true);
    expect(copied).toEqual(["Rôle distant"]);
  });

  it("fait oublier les valeurs en refermant la fiche", async () => {
    const forgotten: string[] = [];

    stubPupitre({
      forgetCredentials: (_server, moduleId) => {
        forgotten.push(moduleId ?? "");

        return Promise.resolve();
      },
      forgetInstallSecrets: () => Promise.resolve(),
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    await useServices.getState().close(SERVER);

    expect(forgotten).toEqual(["db.postgres"]);
    expect(useServices.getState().detail.status).toBe("idle");
  });
});

describe("la configuration d'un module installé", () => {
  it("remet dans le formulaire ce que l'agent a retenu", async () => {
    stubPupitre({
      agentCall: (_server, cmd, params) => {
        expect(cmd).toBe("module.config");
        expect(params).toEqual({ id: "db.mysql" });

        return Promise.resolve({
          ok: true,
          result: {
            id: "db.mysql",
            values: { engine: "mysql", port: 3306 },
            secrets: ["app_password", "remote_password"],
          },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().readConfig(SERVER, "db.mysql");

    const { config, values } = useServices.getState();

    expect(config.status).toBe("ready");
    expect(config.status === "ready" && config.held).toEqual([
      "app_password",
      "remote_password",
    ]);
    expect(values).toEqual({ engine: "mysql", port: 3306 });
  });

  it("renvoie la configuration entière du seul module, sans le mot de passe", async () => {
    const sent: { modules: readonly string[]; config: unknown }[] = [];
    const filed: { key: string; value: string }[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: {
            id: "db.mysql",
            values: { engine: "mysql", port: 3306 },
            secrets: ["app_password"],
          },
        } as AgentResponse<unknown>),
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
      setInstallSecret: (_server, _module, key, value) => {
        filed.push({ key, value });

        return Promise.resolve({ ok: true, result: {} });
      },
      startInstall: (_server, modules, config) => {
        sent.push({ config, modules });

        return Promise.resolve({
          ok: true,
          result: {
            failed: [],
            report_path: "/var/lib/pupitre/report.json",
            warned: [],
          },
        });
      },
    });

    await useServices.getState().readConfig(SERVER, "db.mysql");
    useServices.getState().setValue("port", 3307);
    await useServices
      .getState()
      .setSecret(SERVER, "db.mysql", "app_password", PASSWORD);
    await useServices.getState().reconfigure(SERVER, "db.mysql");

    expect(filed).toEqual([{ key: "app_password", value: PASSWORD }]);
    expect(sent).toEqual([
      {
        config: { "db.mysql": { engine: "mysql", port: 3307 } },
        modules: ["db.mysql"],
      },
    ]);
    expect(JSON.stringify(useServices.getState())).not.toContain(PASSWORD);
  });
});

describe("retirer un module", () => {
  it("suit les étapes de l'agent comme une installation", async () => {
    stubPupitre({
      agentStream: (_server, cmd, params, onEvent) => {
        expect(cmd).toBe("uninstall");
        expect(params).toEqual({ modules: ["db.postgres"] });

        onEvent(step("db.postgres", "systemd", "start", 0));
        onEvent(step("db.postgres", "systemd", "ok", 1200));
        onEvent(step("db.postgres", "purge", "ok", 3400));

        return Promise.resolve({
          ok: true,
          result: { failed: [] },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().remove(SERVER, "db.postgres");

    const { removal, steps } = useServices.getState();

    expect(removal.status).toBe("done");
    expect(steps[0]?.status).toBe("ok");
    expect(steps[0]?.steps.map((entry) => entry.step)).toEqual([
      "systemd",
      "purge",
    ]);
    expect(steps[0]?.ms).toBe(4600);
  });

  it("garde ce que le serveur dit n'avoir pas pu retirer", async () => {
    stubPupitre({
      agentStream: () =>
        Promise.resolve({
          ok: true,
          result: { failed: ["db.postgres"] },
        } as AgentResponse<unknown>),
    });

    await useServices.getState().remove(SERVER, "db.postgres");

    const { removal } = useServices.getState();

    expect(removal.status === "done" && removal.failed).toEqual([
      "db.postgres",
    ]);
  });
});

describe("les gestes d'une base", () => {
  it("déduit le moteur du module et rend le chemin de l'export", async () => {
    const sent: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      agentCall: (_server, cmd, params) => {
        sent.push({ cmd, params });

        return Promise.resolve({
          ok: true,
          result: { path: "/home/dev/dumps/app.dump", size_bytes: 4_200_000 },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().dump(SERVER, "db.mysql");

    expect(sent).toEqual([{ cmd: "db.dump", params: { engine: "mysql" } }]);
    expect(useServices.getState().database).toEqual({
      bytes: 4_200_000,
      kind: "dump",
      lines: ["/home/dev/dumps/app.dump"],
    });
  });

  it("rend la commande de shell telle que l'agent l'a composée", async () => {
    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { command: "sudo -u postgres psql app" },
        } as AgentResponse<unknown>),
    });

    await useServices.getState().shell(SERVER, "db.postgres");

    expect(useServices.getState().database?.lines).toEqual([
      "sudo -u postgres psql app",
    ]);
  });

  it("ne dit rien à l'agent pour un module qui n'est pas une base", async () => {
    const sent: string[] = [];

    stubPupitre({
      agentCall: (_server, cmd) => {
        sent.push(cmd);

        return Promise.resolve({
          ok: true,
          result: {},
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().dump(SERVER, "runtime.node");

    expect(sent).toEqual([]);
  });
});
