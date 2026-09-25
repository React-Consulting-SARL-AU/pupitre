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

describe("les canaux de l'apparence, de l'aide, des captures et de la connexion", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("help:open", OTHER_PAGE, "docs", "fr")).toBe(true);
    expect(refused("account:sign-in-cancel", OTHER_PAGE)).toBe(true);
  });

  it("refusent une apparence qui n'en a pas la forme", () => {
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

  it("refusent un lien d'aide inconnu ou une langue absente", () => {
    expect(refused("help:open", OWN_PAGE, "nowhere", "fr")).toBe(true);
    expect(refused("help:open", OWN_PAGE, "docs")).toBe(true);
  });

  it("refusent une capture sans chemin ou sans octets", () => {
    expect(refused("shots:save", OWN_PAGE, 3, new Uint8Array(1))).toBe(true);
    expect(refused("shots:save", OWN_PAGE, "/tmp/a.png", "bytes")).toBe(true);
  });

  it("refusent un argument de trop", () => {
    expect(refused("account:sign-in-cancel", OWN_PAGE, "extra")).toBe(true);
  });
});
