import { beforeEach, describe, expect, it } from "bun:test";
import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentResponse } from "@shared/agent";
import type { PortForward } from "@shared/services";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { forwardsOf, useTunnel } from "../tunnel";

const SERVER = "srv-1";

const TUNNEL: TunnelStatusResult = {
  provider: "cloudflare",
  installed: true,
  routes: [
    {
      hostname: "flyleaf.example.org",
      project: "flyleaf-api",
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
  useTunnel.setState({ forwards: [] });
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

  it("redemande son état après la synchronisation, et écrit les noms des routes", async () => {
    const sent: string[] = [];
    const named: string[] = [];

    stubPupitre({
      agentCall: (_server, cmd) => {
        sent.push(cmd);

        return Promise.resolve({
          ok: true,
          result: TUNNEL,
        } as AgentResponse<unknown>);
      },
      syncTunnelRecords: (_server, routes) => {
        named.push(...routes.map((route) => route.hostname));

        return Promise.resolve({ ok: true, result: routes.length });
      },
    });

    await useTunnel.getState().sync(SERVER);

    expect(sent).toEqual(["tunnel.sync"]);
    expect(named).toEqual(["flyleaf.example.org"]);
    expect(useTunnel.getState().busy).toBeNull();
    expect(useTunnel.getState().problem).toBeNull();
  });

  it("garde le refus de l'écriture des noms", async () => {
    stubPupitre({
      agentCall: () =>
        Promise.resolve({ ok: true, result: TUNNEL } as AgentResponse<unknown>),
      syncTunnelRecords: () =>
        Promise.resolve({
          error: { code: "bad_request", message: "zone inconnue" },
          ok: false,
        }),
    });

    await useTunnel.getState().sync(SERVER);

    expect(useTunnel.getState().problem?.message).toBe("zone inconnue");
    expect(useTunnel.getState().tunnel.status).toBe("ready");
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

describe("la liste des redirections de cet ordinateur", () => {
  it("suit ce que le processus principal dit, serveur par serveur", async () => {
    const held: { push: ((forwards: PortForward[]) => void) | null } = {
      push: null,
    };
    const other: PortForward = { ...FORWARD, id: "f2", serverId: "srv-2" };

    stubPupitre({
      onPortForwards: (listener) => {
        held.push = listener;

        return () => {
          held.push = null;
        };
      },
      portForwards: () => Promise.resolve([FORWARD]),
    });

    const stop = useTunnel.getState().follow();

    await Promise.resolve();

    expect(useTunnel.getState().forwards).toEqual([FORWARD]);

    held.push?.([FORWARD, other]);

    expect(forwardsOf(useTunnel.getState().forwards, SERVER)).toEqual([
      FORWARD,
    ]);
    expect(forwardsOf(useTunnel.getState().forwards, "srv-2")).toEqual([other]);

    stop();

    expect(held.push).toBeNull();
  });

  it("oublie le tunnel et son refus d'une machine quittée, pas les redirections de cet ordinateur", async () => {
    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          error: { code: "internal", message: "le tunnel refuse" },
          ok: false,
        }),
    });
    useTunnel.setState({
      forwards: [
        {
          id: "fwd-1",
          label: "PostgreSQL",
          localPort: 15_432,
          remotePort: 5432,
          serverId: "srv-1",
          state: "open",
        },
      ] as never,
    });

    await useTunnel.getState().sync("srv-1");
    expect(useTunnel.getState().problem).not.toBeNull();

    useTunnel.getState().forget();

    expect(useTunnel.getState().problem).toBeNull();
    expect(useTunnel.getState().tunnel).toEqual({ status: "idle" });
    expect(useTunnel.getState().forwards).toHaveLength(1);
  });
});
