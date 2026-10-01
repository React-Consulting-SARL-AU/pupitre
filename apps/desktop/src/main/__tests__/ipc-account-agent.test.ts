import { describe, expect, it } from "bun:test";
import { OTHER_PAGE, OWN_PAGE, recordChannels, refused } from "./ipc-recorder";

recordChannels();

const { registerAccount } = await import("../account");
const { registerAgentChannels, registerLanguage, registerPlatformSync } =
  await import("../agent");
const { registerAgentUpdate } = await import("../agent-update");
const { registerPreferences } = await import("../app-preferences");
const { registerCompletions } = await import("../completion");
const { registerDevDefaults } = await import("../dev-defaults");
const { registerHarden } = await import("../harden");
const { registerInspection } = await import("../inspection");
const { registerKeyApprovals } = await import("../key-approvals");
const { registerLinks } = await import("../links");
const { registerReenroll } = await import("../reenroll");
const { registerSudo } = await import("../sudo");
const { startUpdater } = await import("../updater");

const spoken: string[] = [];

registerAccount();
registerAgentChannels();
registerLanguage((locale) => spoken.push(locale));
registerPlatformSync();
registerAgentUpdate();
registerPreferences();
registerCompletions();
registerDevDefaults();
registerHarden();
registerInspection();
registerKeyApprovals();
registerLinks(() => undefined);
registerReenroll();
registerSudo();
startUpdater();

const WITHOUT_ARGUMENT = [
  "account:state",
  "account:refresh",
  "account:sign-out",
  "account:devices",
  "notifications:enabled",
  "startup:state",
  "dev:defaults",
  "deep-link:pending",
  "key-approvals:list",
  "app:about",
  "app-update:state",
  "app-update:check",
  "app-update:install",
];

const SERVER_ONLY = [
  "platform:sync",
  "agent:session",
  "agent:close",
  "agent-update:state",
  "agent-update:migrate",
  "inspection:probe",
  "reenroll:start",
  "sudo:state",
  "sudo:reveal",
  "sudo:copy",
];

describe("the account, agent and app channels", () => {
  it("refuse a frame other than the app's page", () => {
    expect(refused("account:state", OTHER_PAGE)).toBe(true);
    expect(refused("agent:session", OTHER_PAGE, "srv-1")).toBe(true);
    expect(refused("open-url", OTHER_PAGE, "https://pupitre.studio")).toBe(
      true
    );
    expect(refused("locale:set", OTHER_PAGE, "fr")).toBe(true);
    expect(spoken).toEqual([]);
  });

  it("refuse any argument on a channel that takes none", () => {
    for (const channel of WITHOUT_ARGUMENT) {
      expect(refused(channel, OWN_PAGE, "extra")).toBe(true);
    }
  });

  it("refuse a server that is not an identifier", () => {
    for (const channel of SERVER_ONLY) {
      expect(refused(channel, OWN_PAGE, 42)).toBe(true);
      expect(refused(channel, OWN_PAGE)).toBe(true);
      expect(refused(channel, OWN_PAGE, "srv-1", "extra")).toBe(true);
    }
  });

  it("refuse a malformed call to the agent", () => {
    expect(refused("agent:call", OWN_PAGE, 1, "snapshot")).toBe(true);
    expect(refused("agent:call", OWN_PAGE, "srv-1", 7)).toBe(true);
    expect(
      refused("agent:call", OWN_PAGE, "srv-1", "snapshot", {}, "oui")
    ).toBe(true);
    expect(
      refused("agent:call", OWN_PAGE, "srv-1", "snapshot", {}, true, "extra")
    ).toBe(true);
    expect(refused("agent:stream", OWN_PAGE, null, "srv-1", "snapshot")).toBe(
      true
    );
    expect(refused("agent:stream", OWN_PAGE, "token", "srv-1", 3)).toBe(true);
  });

  it("refuse a language the app does not speak", () => {
    expect(refused("locale:set", OWN_PAGE, "de")).toBe(true);
    expect(refused("locale:set", OWN_PAGE, 1)).toBe(true);
    expect(spoken).toEqual([]);
  });

  it("refuse an account called with values of another shape", () => {
    expect(refused("account:organization", OWN_PAGE, { id: "org" })).toBe(true);
    expect(refused("account:device-revoke", OWN_PAGE, 5)).toBe(true);
    expect(refused("account:sign-in", OWN_PAGE, undefined)).toBe(true);
    expect(refused("key-approvals:approve", OWN_PAGE, "srv-1", 2)).toBe(true);
  });

  it("refuse an update or a hardening without a token", () => {
    expect(refused("agent-update:agent", OWN_PAGE, 1, "srv-1")).toBe(true);
    expect(refused("agent-update:modules", OWN_PAGE, "token", 1, [])).toBe(
      true
    );
    expect(
      refused("agent-update:modules", OWN_PAGE, "token", "srv-1", [], "extra")
    ).toBe(true);
    expect(refused("harden:start", OWN_PAGE, "token", 1)).toBe(true);
    expect(refused("harden:start", OWN_PAGE, undefined, "srv-1")).toBe(true);
  });

  it("refuse a preference that is not a boolean", () => {
    expect(refused("notifications:set", OWN_PAGE, "true")).toBe(true);
    expect(refused("startup:set", OWN_PAGE, 1)).toBe(true);
  });

  it("refuse a password, a path or an address of another shape", () => {
    expect(refused("sudo:enter", OWN_PAGE, "srv-1", 1234)).toBe(true);
    expect(refused("completions", OWN_PAGE, "srv-1", ["src"])).toBe(true);
    expect(refused("open-url", OWN_PAGE, { href: "https://x" })).toBe(true);
  });
});
