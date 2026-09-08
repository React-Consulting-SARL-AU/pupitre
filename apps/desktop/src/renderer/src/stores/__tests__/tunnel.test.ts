import { beforeEach, describe, expect, it } from "bun:test";
import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentResponse } from "@shared/agent";
import type { PortForward } from "@shared/services";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useTunnel } from "../tunnel";

const SERVER = "srv-1";

const TUNNEL: TunnelStatusResult = {
  provider: "cloudflare",
  installed: true,
  routes: [
    {
      hostname: "flymate.example.org",
      project: "flymate-api",
      service: "http://127.0.0.1:3000",
    },
  ],
  state: "running",
};

const FORWARD: PortForward = {
  id: "f1",
  label: "db.postgres",
  localPort: 55_001,
  remotePort: 5432,
  serverId: SERVER,
};

beforeEach(() => {
  useTunnel.getState().forget();
});

describe("le tunnel de l'agent", () => {
  it("montre les routes que l'agent déclare", async () => {
    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: TUNNEL,
        } as AgentResponse<unknown>),
    });

    await useTunnel.getState().read(SERVER);

    const { tunnel } = useTunnel.getState();

    expect(tunnel.status === "ready" && tunnel.tunnel.routes).toHaveLength(1);
  });

  it("redemande son état après chaque geste", async () => {
    const sent: string[] = [];

    stubPupitre({
      agentCall: (_server, cmd) => {
        sent.push(cmd);

        return Promise.resolve({
          ok: true,
          result: TUNNEL,
        } as AgentResponse<unknown>);
      },
    });

    await useTunnel.getState().sync(SERVER);
    await useTunnel.getState().restart(SERVER);

    expect(sent).toEqual(["tunnel.sync", "tunnel.restart"]);
    expect(useTunnel.getState().busy).toBeNull();
  });

  it("garde le refus de l'agent avec son remède", async () => {
    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "module_not_found",
            fix: "Installe exposure.cloudflare depuis les services.",
            message: "Aucun tunnel sur ce serveur.",
          },
        } as AgentResponse<unknown>),
    });

    await useTunnel.getState().read(SERVER);

    expect(useTunnel.getState().problem?.fix).toBe(
      "Installe exposure.cloudflare depuis les services."
    );
  });
});

describe("le tunnel de l'app", () => {
  it("ouvre un port du serveur sur cette machine", async () => {
    const asked: number[] = [];

    stubPupitre({
      openPortForward: (_server, remotePort) => {
        asked.push(remotePort);

        return Promise.resolve({ ok: true, result: FORWARD });
      },
      portForwards: () => Promise.resolve([FORWARD]),
    });

    await useTunnel.getState().forward(SERVER, 5432, "db.postgres");

    expect(asked).toEqual([5432]);
    expect(useTunnel.getState().forwards[0]?.localPort).toBe(55_001);
  });

  it("dit pourquoi il n'a pas pu s'ouvrir", async () => {
    stubPupitre({
      openPortForward: () =>
        Promise.resolve({
          ok: false,
          error: { code: "bad_request", message: "Ce port n'existe pas." },
        }),
      portForwards: () => Promise.resolve([]),
    });

    await useTunnel.getState().forward(SERVER, 70_000, "db.postgres");

    expect(useTunnel.getState().problem?.message).toBe("Ce port n'existe pas.");
    expect(useTunnel.getState().forwards).toEqual([]);
  });

  it("se referme sur demande", async () => {
    stubPupitre({
      closePortForward: () => Promise.resolve([]),
      openPortForward: () => Promise.resolve({ ok: true, result: FORWARD }),
      portForwards: () => Promise.resolve([FORWARD]),
    });

    await useTunnel.getState().forward(SERVER, 5432, "db.postgres");
    await useTunnel.getState().closeForward("f1");

    expect(useTunnel.getState().forwards).toEqual([]);
  });
});
