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

describe("the agent's tunnel", () => {
  it("shows the routes the agent declares", async () => {
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

  it("asks for its state again after syncing, and writes the route names", async () => {
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

  it("keeps the refusal of the name write", async () => {
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

  it("keeps the agent's refusal with its fix", async () => {
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

describe("the app's tunnel", () => {
  it("opens a server port on this machine", async () => {
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

  it("says why it could not open", async () => {
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

  it("closes on request", async () => {
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

describe("this computer's forward list", () => {
  it("follows what the main process says, server by server", async () => {
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

  it("forgets the tunnel and its refusal from a machine that was left, not this computer's forwards", async () => {
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
