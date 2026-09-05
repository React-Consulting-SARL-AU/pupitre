import { describe, expect, it } from "bun:test";
import type { UsageRight } from "@shared/account";
import { shellScreen } from "../shell-screen";

/**
 * Which shell the app opens on: the account, the onboarding, a server that has
 * not answered, or the server itself. The usage right decides first — nothing
 * of a machine is reachable before the account is — and `snapshot` decides the
 * rest.
 */

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const GRANTED: UsageRight = {
  entitlement: "valid",
  source: "platform",
  status: "granted",
  validUntil: null,
};

const CACHED: UsageRight = {
  entitlement: "valid",
  source: "cache",
  status: "granted",
  validUntil: "2026-09-11T10:00:00.000Z",
};

const ABSENT: UsageRight = { consoleUrl: CONSOLE_URL, status: "absent" };

const STALE: UsageRight = {
  consoleUrl: CONSOLE_URL,
  since: "2026-08-01T10:00:00.000Z",
  status: "stale",
};

const SUSPENDED: UsageRight = { consoleUrl: CONSOLE_URL, status: "suspended" };

const READY = {
  answered: true,
  onboarding: "closed" as const,
  serverId: "srv-1",
  usage: GRANTED,
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

describe("le droit d'usage décide avant tout le reste", () => {
  const refused: [string, UsageRight][] = [
    ["absent", ABSENT],
    ["expiré", STALE],
    ["suspendu", SUSPENDED],
  ];

  for (const [name, usage] of refused) {
    it(`ouvre le compte devant l'onboarding quand le droit d'usage est ${name}`, () => {
      expect(shellScreen({ ...READY, onboarding: "inspection", usage })).toBe(
        "account"
      );
    });

    it(`ouvre le compte devant un serveur qui répond quand le droit d'usage est ${name}`, () => {
      expect(shellScreen({ ...READY, usage })).toBe("account");
    });

    it(`laisse les réglages joignables quand le droit d'usage est ${name}`, () => {
      expect(shellScreen({ ...READY, usage, view: "settings" })).toBe(
        "settings"
      );
    });
  }

  it("ouvre le serveur quand la plateforme vient de répondre", () => {
    expect(shellScreen({ ...READY, usage: GRANTED })).toBe("server");
  });

  it("ouvre le serveur sur une session en cache de moins de sept jours", () => {
    expect(shellScreen({ ...READY, usage: CACHED })).toBe("server");
  });

  it("ouvre l'onboarding d'un build de développement sans compte", () => {
    expect(
      shellScreen({
        ...READY,
        answered: false,
        onboarding: "server",
        serverId: null,
        usage: {
          entitlement: "none",
          source: "development",
          status: "granted",
          validUntil: null,
        },
      })
    ).toBe("onboarding");
  });
});
