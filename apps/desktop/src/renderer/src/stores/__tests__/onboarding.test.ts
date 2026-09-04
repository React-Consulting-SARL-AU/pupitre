import { beforeEach, describe, expect, it } from "bun:test";
import { CATALOG } from "../../__tests__/catalog-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useCatalog } from "../catalog";
import { forgetOnboarding, useOnboarding } from "../onboarding";

function catalogue(): void {
  useCatalog.setState({
    catalog: { catalog: CATALOG, serverId: "srv-1", status: "ready" },
    selected: ["db.postgres", "runtime.node"],
  });
}

beforeEach(() => {
  forgetOnboarding();
  useOnboarding.getState().reset();
});

describe("l'ordre de l'onboarding", () => {
  it("va du serveur au durcissement, l'agent avant le catalogue", () => {
    const store = useOnboarding.getState();

    store.open();
    expect(useOnboarding.getState().step).toBe("server");

    store.begin("srv-1");
    expect(useOnboarding.getState().step).toBe("inspection");

    store.goTo("agent");
    store.goTo("catalog");
    store.goTo("config");
    store.goTo("install");
    store.goTo("harden");

    expect(useOnboarding.getState().step).toBe("harden");
  });

  it("revient en arrière tant que rien n'est installé", () => {
    const store = useOnboarding.getState();

    store.begin("srv-1");
    store.goTo("catalog");

    expect(useOnboarding.getState().canGoBack()).toBe(true);

    store.back();
    expect(useOnboarding.getState().step).toBe("agent");
  });

  it("ne revient plus en arrière une fois l'installation lancée", () => {
    const store = useOnboarding.getState();

    store.begin("srv-1");
    store.goTo("install");
    store.noteInstalled();

    expect(useOnboarding.getState().canGoBack()).toBe(false);

    store.back();
    expect(useOnboarding.getState().step).toBe("install");
  });
});

describe("une app qui redémarre", () => {
  it("reprend l'onboarding là où il s'était arrêté", () => {
    useOnboarding.getState().begin("srv-1");
    useOnboarding.getState().goTo("catalog");

    // Le redémarrage : un store neuf, et rien d'autre que ce qui a été écrit.
    useOnboarding.setState({
      installed: false,
      replaying: null,
      serverId: null,
      step: "closed",
    });

    useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("catalog");
    expect(useOnboarding.getState().serverId).toBe("srv-1");
  });

  it("ne rouvre rien quand l'onboarding est allé au bout", () => {
    useOnboarding.getState().begin("srv-1");
    useOnboarding.getState().goTo("done");
    useOnboarding.getState().close();

    useOnboarding.setState({ serverId: null, step: "closed" });
    useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("closed");
  });

  it("garde l'étape quittée pour la reprendre depuis l'écran des serveurs", () => {
    useOnboarding.getState().begin("srv-1");
    useOnboarding.getState().goTo("install");
    useOnboarding.getState().close();

    expect(useOnboarding.getState().step).toBe("closed");

    useOnboarding.getState().resume();
    expect(useOnboarding.getState().step).toBe("install");
  });
});

describe("rejouer un module", () => {
  it("repasse par la configuration quand le module portait un secret", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    store.goTo("install");
    store.noteInstalled();

    expect(store.replay("db.postgres")).toBe("config");
    expect(useOnboarding.getState().step).toBe("config");
    expect(useOnboarding.getState().replaying).toBe("db.postgres");
  });

  it("repart directement quand le module n'en portait pas", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    store.goTo("install");
    store.noteInstalled();

    expect(store.replay("runtime.node")).toBe("install");
    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().replaying).toBeNull();
  });

  it("revient à l'installation une fois la configuration refaite", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    store.goTo("install");
    store.replay("db.postgres");
    store.endReplay();

    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().replaying).toBeNull();
  });
});

describe("l'envoi du binaire de l'agent", () => {
  it("garde ce que le serveur a reçu", async () => {
    stubPupitre({
      sendAgent: () =>
        Promise.resolve({
          ok: true,
          result: {
            arch: "amd64",
            bytes: 18_000_000,
            path: "/usr/local/bin/pupitred",
            sha256: "a".repeat(64),
          },
        }),
    });

    useOnboarding.getState().begin("srv-1");
    await useOnboarding.getState().sendAgent();

    expect(useOnboarding.getState().delivery).toMatchObject({
      delivery: { arch: "amd64", path: "/usr/local/bin/pupitred" },
      status: "sent",
    });
  });

  it("garde le remède de l'agent en cas d'échec", async () => {
    stubPupitre({
      sendAgent: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            fix: "Vérifie que le compte utilisé peut écrire dans /usr/local/bin.",
            message: "L'agent n'a pas pu être installé sur le serveur.",
          },
        }),
    });

    useOnboarding.getState().begin("srv-1");
    await useOnboarding.getState().sendAgent();

    expect(useOnboarding.getState().delivery).toMatchObject({
      error: {
        fix: "Vérifie que le compte utilisé peut écrire dans /usr/local/bin.",
      },
      status: "failed",
    });
  });
});
