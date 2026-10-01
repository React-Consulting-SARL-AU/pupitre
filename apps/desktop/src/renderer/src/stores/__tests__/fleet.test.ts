import { beforeEach, describe, expect, it } from "bun:test";
import type { AgentResponse } from "@shared/agent";
import type {
  FleetServer,
  FleetView,
  Server,
  ServerGrant,
  ServersConfig,
} from "@shared/servers";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { grantedServers, useFleet } from "../fleet";
import { useOnboarding } from "../onboarding";
import { useServers } from "../servers";

const GRANTED: FleetServer = {
  host: "203.0.113.10",
  hostFingerprint: "SHA256:atelier",
  id: "srv-platform-1",
  keyReady: true,
  name: "vps-atelier",
  organization: { id: "org-1", name: "Flyleaf" },
  port: 22,
  status: "active",
  user: "dev",
};

const GRANT: ServerGrant = {
  adopted: true,
  id: "srv-platform-1",
  keyReady: true,
  listed: true,
  opened: false,
  status: "active",
};

function localServer(grant: ServerGrant = GRANT): Server {
  return {
    grant,
    host: "203.0.113.10",
    id: "srv-platform-1",
    keyPath: "/data/keys/device",
    name: "vps-atelier",
    origin: "app",
    port: 22,
    user: "dev",
  };
}

function view(server: Server = localServer()): FleetView {
  return {
    adopted: [server.id],
    changed: false,
    config: { active: server.id, servers: [server] },
    granted: [GRANTED],
    withdrawn: [],
  };
}

function stub({
  fleet,
  open,
}: {
  fleet: AgentResponse<FleetView>;
  open?: AgentResponse<ServersConfig>;
}): void {
  stubPupitre({
    fleet: () => Promise.resolve(fleet),
    openGrantedServer: () =>
      Promise.resolve(
        open ?? { ok: true, result: { active: null, servers: [] } }
      ),
    servers: () => Promise.resolve({ active: null, servers: [] }),
  });
}

beforeEach(() => {
  useFleet.setState({ opening: { status: "idle" }, state: { status: "idle" } });
  useOnboarding.getState().reset();
  useServers.setState({ config: null, status: "idle" });
});

describe("reading the assigned servers", () => {
  it("keeps the merge as the main process returned it", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();

    expect(useFleet.getState().state).toEqual({
      status: "read",
      view: view(),
    });
  });

  it("keeps the message and fix of a refusal, word for word", async () => {
    stub({
      fleet: {
        ok: false,
        error: {
          code: "license_required",
          fix: "Connecte-toi depuis les réglages.",
          message: "Cet appareil n'est connecté à aucun compte Pupitre.",
        },
      },
    });

    await useFleet.getState().read();

    expect(useFleet.getState().state).toMatchObject({
      error: { fix: "Connecte-toi depuis les réglages." },
      status: "failed",
    });
  });

  it("reloads the local list when the merge changed it", async () => {
    const changed = { ...view(), changed: true };

    stub({ fleet: { ok: true, result: changed } });

    await useFleet.getState().read();

    expect(useServers.getState().status).toBe("ready");
  });

  it("does not reload the local list when nothing changed", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();

    expect(useServers.getState().status).toBe("idle");
  });
});

describe("the first opening of an assigned server", () => {
  it("drives it, and opens no wizard: it is already installed", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-platform-1");

    expect(useFleet.getState().opening).toEqual({
      serverId: "srv-platform-1",
      status: "opened",
    });
    expect(useOnboarding.getState().step).toBe("closed");
  });

  it("no longer opens the customisation the second time", async () => {
    stub({
      fleet: {
        ok: true,
        result: view(localServer({ ...GRANT, opened: true })),
      },
    });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-platform-1");

    expect(useOnboarding.getState().step).toBe("closed");
  });

  it("waits without asking anything until the key is placed", async () => {
    stub({
      fleet: {
        ok: true,
        result: view(localServer({ ...GRANT, keyReady: false })),
      },
    });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-platform-1");

    expect(useFleet.getState().opening).toEqual({
      serverId: "srv-platform-1",
      status: "waiting",
    });
    expect(useOnboarding.getState().step).toBe("closed");
  });

  it("resumes opening by itself as soon as the key is placed", async () => {
    stub({
      fleet: {
        ok: true,
        result: view(localServer({ ...GRANT, keyReady: false })),
      },
    });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-platform-1");

    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();

    expect(useFleet.getState().opening).toMatchObject({ status: "opened" });
  });

  it("shows the fix of the refusal without rewording it", async () => {
    stub({
      fleet: { ok: true, result: view() },
      open: {
        ok: false,
        error: {
          code: "license_required",
          fix: "Demande à un administrateur de te l'attribuer à nouveau.",
          message: "Ce serveur ne t'est plus attribué.",
        },
      },
    });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-platform-1");

    expect(useFleet.getState().opening).toMatchObject({
      error: {
        fix: "Demande à un administrateur de te l'attribuer à nouveau.",
      },
      status: "refused",
    });
  });

  it("ignores a server the merge does not know", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-inconnu");

    expect(useFleet.getState().opening).toEqual({ status: "idle" });
  });
});

describe("the assigned servers of the list", () => {
  it("keeps only those the console named", () => {
    const typed: Server = {
      host: "vps.test",
      id: "srv-local",
      name: "Le mien",
      origin: "app",
      port: 22,
      user: "root",
    };

    expect(
      grantedServers({
        status: "read",
        view: {
          ...view(),
          config: { active: null, servers: [typed, localServer()] },
        },
      }).map((server) => server.id)
    ).toEqual(["srv-platform-1"]);
  });

  it("keeps none while nothing has been read", () => {
    expect(grantedServers({ status: "idle" })).toEqual([]);
  });
});
