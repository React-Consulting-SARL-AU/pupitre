import { describe, expect, it } from "bun:test";
import { shellScreen } from "../shell-screen";

/**
 * Which shell the app opens on: the onboarding, a server that has not answered,
 * or the server itself. `snapshot` is the whole of the decision.
 */

const READY = {
  answered: true,
  onboarding: "closed" as const,
  serverId: "srv-1",
  view: "dashboard" as const,
};

describe("shellScreen", () => {
  it("ouvre l'onboarding tant qu'il est en cours", () => {
    expect(shellScreen({ ...READY, onboarding: "inspection" })).toBe(
      "onboarding"
    );
  });

  it("ouvre le tableau de bord quand le serveur a répondu", () => {
    expect(shellScreen(READY)).toBe("server");
  });

  it("ouvre l'écran d'installation tant qu'aucun serveur n'est déclaré", () => {
    expect(shellScreen({ ...READY, answered: false, serverId: null })).toBe(
      "unready"
    );
  });

  it("ouvre l'écran d'installation quand le serveur ne répond pas", () => {
    expect(shellScreen({ ...READY, answered: false })).toBe("unready");
  });

  it("laisse les réglages joignables quand rien ne répond", () => {
    expect(shellScreen({ ...READY, answered: false, view: "settings" })).toBe(
      "settings"
    );
  });

  it("garde l'onboarding devant les réglages", () => {
    expect(
      shellScreen({
        ...READY,
        answered: false,
        onboarding: "install",
        view: "settings",
      })
    ).toBe("onboarding");
  });
});
