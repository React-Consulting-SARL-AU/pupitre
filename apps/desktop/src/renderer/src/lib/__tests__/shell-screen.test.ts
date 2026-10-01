import { describe, expect, it } from "bun:test";
import type { UsageRight } from "@shared/account";
import { shellScreen } from "../shell-screen";

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const GRANTED: UsageRight = {
  license: "valid",
  source: "platform",
  status: "granted",
  validUntil: null,
};

const CACHED: UsageRight = {
  license: "valid",
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
  bypassed: false,
  onboarding: "closed" as const,
  serverId: "srv-1",
  signedIn: true,
  usage: GRANTED,
  view: "dashboard" as const,
};

const DEVELOPMENT: UsageRight = {
  license: "none",
  source: "development",
  status: "granted",
  validUntil: null,
};

describe("shellScreen", () => {
  it("opens onboarding while it is in progress", () => {
    expect(shellScreen({ ...READY, onboarding: "inspection" })).toBe(
      "onboarding"
    );
  });

  it("opens the dashboard when the server has responded", () => {
    expect(shellScreen(READY)).toBe("server");
  });

  it("opens the install screen while no server is declared", () => {
    expect(shellScreen({ ...READY, answered: false, serverId: null })).toBe(
      "unready"
    );
  });

  it("opens the install screen when the server does not respond", () => {
    expect(shellScreen({ ...READY, answered: false })).toBe("unready");
  });

  it("keeps settings reachable when nothing responds", () => {
    expect(shellScreen({ ...READY, answered: false, view: "settings" })).toBe(
      "settings"
    );
  });

  it("keeps onboarding in front of settings", () => {
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

describe("the licence decides before everything else", () => {
  const refused: [string, UsageRight][] = [
    ["absent", ABSENT],
    ["expiré", STALE],
    ["suspendu", SUSPENDED],
  ];

  for (const [name, usage] of refused) {
    it(`opens the account in front of onboarding when the licence is ${name}`, () => {
      expect(shellScreen({ ...READY, onboarding: "inspection", usage })).toBe(
        "account"
      );
    });

    it(`opens the account in front of a responding server when the licence is ${name}`, () => {
      expect(shellScreen({ ...READY, usage })).toBe("account");
    });

    it(`keeps settings reachable when the licence is ${name}`, () => {
      expect(shellScreen({ ...READY, usage, view: "settings" })).toBe(
        "settings"
      );
    });
  }

  it("opens the server when the console has just responded", () => {
    expect(shellScreen({ ...READY, usage: GRANTED })).toBe("server");
  });

  it("opens the server on a cached session less than seven days old", () => {
    expect(shellScreen({ ...READY, usage: CACHED })).toBe("server");
  });

  it("opens onboarding for a development build that was let through", () => {
    expect(
      shellScreen({
        ...READY,
        answered: false,
        bypassed: true,
        onboarding: "server",
        serverId: null,
        signedIn: false,
        usage: DEVELOPMENT,
      })
    ).toBe("onboarding");
  });
});

describe("sign-in comes before everything else", () => {
  it("opens the account while nobody is signed in on this computer", () => {
    expect(shellScreen({ ...READY, signedIn: false })).toBe("account");
  });

  it("opens the account of a development build that grants itself the licence", () => {
    expect(shellScreen({ ...READY, signedIn: false, usage: DEVELOPMENT })).toBe(
      "account"
    );
  });

  it("keeps the account in front of an onboarding in progress", () => {
    expect(
      shellScreen({ ...READY, onboarding: "inspection", signedIn: false })
    ).toBe("account");
  });

  it("keeps settings reachable before sign-in", () => {
    expect(shellScreen({ ...READY, signedIn: false, view: "settings" })).toBe(
      "settings"
    );
  });

  it("lets through a development build that asked to continue without an account", () => {
    expect(
      shellScreen({
        ...READY,
        bypassed: true,
        signedIn: false,
        usage: DEVELOPMENT,
      })
    ).toBe("server");
  });

  it("still refuses a suspended licence, signed in or not", () => {
    expect(shellScreen({ ...READY, usage: SUSPENDED })).toBe("account");
    expect(
      shellScreen({
        ...READY,
        bypassed: true,
        signedIn: false,
        usage: SUSPENDED,
      })
    ).toBe("account");
  });
});
