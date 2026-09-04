import { beforeEach, describe, expect, it } from "bun:test";
import type { Server } from "@shared/servers";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useServers } from "../servers";

const STAGING: Server = {
  host: "203.0.113.10",
  id: "srv-a",
  keyPath: "/data/keys/srv-a",
  name: "Staging",
  origin: "app",
  port: 22,
  user: "root",
};

const DRAFT = {
  host: "203.0.113.10",
  key: { mode: "generate" } as const,
  name: "Staging",
  port: 22,
  user: "root",
};

function reset(): void {
  useServers.setState({
    addition: { status: "idle" },
    config: null,
    hostKey: { status: "unknown" },
    publicKey: null,
    status: "idle",
  });
}

describe("l'ajout d'un serveur", () => {
  beforeEach(reset);

  it("garde la clé publique et la commande que le processus principal renvoie", async () => {
    stubPupitre({
      addServer: () =>
        Promise.resolve({
          ok: true,
          result: {
            config: { active: "srv-a", servers: [STAGING] },
            copyId: "ssh-copy-id -i /data/keys/srv-a.pub root@203.0.113.10",
            publicKey: "ssh-ed25519 AAAAC3Nz pupitre srv-a",
            server: STAGING,
          },
        }),
    });

    await useServers.getState().add(DRAFT);

    expect(useServers.getState().addition).toMatchObject({
      copyId: "ssh-copy-id -i /data/keys/srv-a.pub root@203.0.113.10",
      publicKey: "ssh-ed25519 AAAAC3Nz pupitre srv-a",
      status: "added",
    });
    expect(useServers.getState().config?.servers).toEqual([STAGING]);
  });

  it("garde le remède du refus tel quel", async () => {
    stubPupitre({
      addServer: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "bad_request",
            fix: "Une adresse IP ou un nom d'hôte, sans espace.",
            message: "Cette adresse ne ressemble pas à un hôte.",
          },
        }),
    });

    await useServers.getState().add({ ...DRAFT, host: "203.0.113.10 ; id" });

    expect(useServers.getState().addition).toMatchObject({
      error: { fix: "Une adresse IP ou un nom d'hôte, sans espace." },
      status: "failed",
    });
  });
});

describe("la clé d'hôte", () => {
  beforeEach(reset);

  it("bloque la connexion quand elle a changé, en gardant l'explication", async () => {
    stubPupitre({
      hostKey: () =>
        Promise.resolve({
          ok: true,
          result: {
            actions: ["reinstalled", "cancel"],
            expected: "SHA256:aaa",
            fix: "Si vous venez de réinstaller ce serveur, remplacez l'empreinte.",
            message:
              "La clé d'hôte de ce serveur a changé depuis le premier contact.",
            observed: "SHA256:bbb",
            status: "changed",
          },
        }),
    });

    await useServers.getState().checkHostKey("srv-a");

    const state = useServers.getState().hostKey;
    expect(state.status).toBe("changed");
    if (state.status !== "changed") {
      return;
    }
    expect(state.serverId).toBe("srv-a");
    expect(state.expected).toBe("SHA256:aaa");
    expect(state.observed).toBe("SHA256:bbb");
    expect(state.fix).toBe(
      "Si vous venez de réinstaller ce serveur, remplacez l'empreinte."
    );
  });

  it("ne retient rien d'un premier contact", async () => {
    stubPupitre({
      hostKey: () =>
        Promise.resolve({ ok: true, result: { status: "first_contact" } }),
    });

    await useServers.getState().checkHostKey("srv-a");

    expect(useServers.getState().hostKey).toEqual({ status: "unknown" });
  });

  it("remplace l'empreinte quand le serveur a été réinstallé, et rouvre la connexion", async () => {
    const forgotten: string[] = [];
    stubPupitre({
      hostKey: () =>
        Promise.resolve({ ok: true, result: { status: "first_contact" } }),
      trustReinstalled: (serverId: string) => {
        forgotten.push(serverId);
        return Promise.resolve({
          ok: true,
          result: { active: "srv-a", servers: [STAGING] },
        });
      },
    });
    useServers.setState({
      hostKey: {
        actions: ["reinstalled", "cancel"],
        expected: "SHA256:aaa",
        fix: "Si vous venez de réinstaller ce serveur, remplacez l'empreinte.",
        message: "La clé d'hôte de ce serveur a changé.",
        observed: "SHA256:bbb",
        serverId: "srv-a",
        status: "changed",
      },
    });

    await useServers.getState().trustReinstalled("srv-a");

    expect(forgotten).toEqual(["srv-a"]);
    expect(useServers.getState().hostKey).toEqual({ status: "unknown" });
  });

  it("laisse l'empreinte en place quand on annule", async () => {
    useServers.setState({
      hostKey: {
        actions: ["reinstalled", "cancel"],
        expected: "SHA256:aaa",
        fix: "Si vous venez de réinstaller ce serveur, remplacez l'empreinte.",
        message: "La clé d'hôte de ce serveur a changé.",
        observed: "SHA256:bbb",
        serverId: "srv-a",
        status: "changed",
      },
    });

    useServers.getState().dismissHostKey();

    expect(useServers.getState().hostKey).toEqual({ status: "unknown" });
  });
});

describe("la liste", () => {
  beforeEach(reset);

  it("prend la configuration que le processus principal renvoie", async () => {
    stubPupitre({
      servers: () => Promise.resolve({ active: "srv-a", servers: [STAGING] }),
    });

    await useServers.getState().load();

    expect(useServers.getState().status).toBe("ready");
    expect(useServers.getState().config?.active).toBe("srv-a");
  });

  it("renomme, choisit l'actif et supprime par identifiant", async () => {
    const calls: string[] = [];
    stubPupitre({
      activateServer: (id: string) => {
        calls.push(`activate ${id}`);
        return Promise.resolve({ active: id, servers: [STAGING] });
      },
      removeServer: (id: string) => {
        calls.push(`remove ${id}`);
        return Promise.resolve({ active: null, servers: [] });
      },
      renameServer: (id: string, name: string) => {
        calls.push(`rename ${id} ${name}`);
        return Promise.resolve({
          active: "srv-a",
          servers: [{ ...STAGING, name }],
        });
      },
    });

    await useServers.getState().rename("srv-a", "Production");
    await useServers.getState().activate("srv-a");
    await useServers.getState().remove("srv-a");

    expect(calls).toEqual([
      "rename srv-a Production",
      "activate srv-a",
      "remove srv-a",
    ]);
    expect(useServers.getState().config?.servers).toEqual([]);
  });
});
