import { describe, expect, it } from "bun:test";
import { OTHER_PAGE, OWN_PAGE, recordChannels, refused } from "./ipc-recorder";

recordChannels();

const { registerAppearance } = await import("../appearance");
const { registerHelp } = await import("../help");
const { registerShots } = await import("../shots");
const { registerSignInCancel } = await import("../sign-in-cancel");

registerAppearance(() => null);
registerHelp();
registerShots();
registerSignInCancel();

describe("the appearance, help, capture and sign-in channels", () => {
  it("refuse a frame other than the app's page", () => {
    expect(refused("help:open", OTHER_PAGE, "docs", "fr")).toBe(true);
    expect(refused("account:sign-in-cancel", OTHER_PAGE)).toBe(true);
  });

  it("refuse an appearance that does not have the right shape", () => {
    expect(
      refused("appearance:set", OWN_PAGE, {
        preference: "system",
        resolved: "dark",
      })
    ).toBe(false);
    expect(refused("appearance:set", OWN_PAGE, "dark")).toBe(true);
    expect(
      refused("appearance:set", OWN_PAGE, {
        preference: "sepia",
        resolved: "dark",
      })
    ).toBe(true);
  });

  it("refuse an unknown help link or a missing language", () => {
    expect(refused("help:open", OWN_PAGE, "nowhere", "fr")).toBe(true);
    expect(refused("help:open", OWN_PAGE, "docs")).toBe(true);
  });

  it("refuse a capture without a path or without bytes", () => {
    expect(refused("shots:save", OWN_PAGE, 3, new Uint8Array(1))).toBe(true);
    expect(refused("shots:save", OWN_PAGE, "/tmp/a.png", "bytes")).toBe(true);
  });

  it("refuse one argument too many", () => {
    expect(refused("account:sign-in-cancel", OWN_PAGE, "extra")).toBe(true);
  });
});
