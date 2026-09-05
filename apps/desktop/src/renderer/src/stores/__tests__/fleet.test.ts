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

/**
 * The servers the platform granted, as the screen reads them.
 *
 * The store never builds an address and never names a key: it shows what the
 * main process merged, and the one gesture it offers is opening a server by
 * its local identifier.
 */

const GRANTED: FleetServer = {
  host: "203.0.113.10",
  hostFingerprint: "SHA256:atelier",
  id: "srv-platform-1",
  keyReady: true,
  name: "vps-atelier",
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

describe("la lecture des serveurs attribués", () => {
  it("garde la fusion telle que le processus principal l'a rendue", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();

    expect(useFleet.getState().state).toEqual({
      status: "read",
      view: view(),
    });
  });

  it("garde le message et le remède d'un refus, mot pour mot", async () => {
    stub({
      fleet: {
        ok: false,
        error: {
          code: "entitlement_required",
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

  it("recharge la liste locale quand la fusion l'a changée", async () => {
    const changed = { ...view(), changed: true };

    stub({ fleet: { ok: true, result: changed } });

    await useFleet.getState().read();

    expect(useServers.getState().status).toBe("ready");
  });

  it("ne recharge pas la liste locale quand rien n'a changé", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();

    expect(useServers.getState().status).toBe("idle");
  });
});

describe("la première ouverture d'un serveur attribué", () => {
  it("le pilote et propose la personnalisation", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-platform-1");

    expect(useFleet.getState().opening).toEqual({
      serverId: "srv-platform-1",
      status: "opened",
    });
    expect(useOnboarding.getState().step).toBe("project");
    expect(useOnboarding.getState().serverId).toBe("srv-platform-1");
  });

  it("n'ouvre plus la personnalisation la seconde fois", async () => {
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

  it("attend sans rien demander tant que la clé n'est pas posée", async () => {
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

  it("reprend l'ouverture d'elle-même dès que la clé est posée", async () => {
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

  it("affiche le remède du refus sans le reformuler", async () => {
    stub({
      fleet: { ok: true, result: view() },
      open: {
        ok: false,
        error: {
          code: "entitlement_required",
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

  it("ignore un serveur que la fusion ne connaît pas", async () => {
    stub({ fleet: { ok: true, result: view() } });

    await useFleet.getState().read();
    await useFleet.getState().open("srv-inconnu");

    expect(useFleet.getState().opening).toEqual({ status: "idle" });
  });
});

describe("les serveurs attribués de la liste", () => {
  it("ne retient que ceux que la plateforme a nommés", () => {
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

  it("n'en retient aucun tant que rien n'a été lu", () => {
    expect(grantedServers({ status: "idle" })).toEqual([]);
  });
});
