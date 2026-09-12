import { describe, expect, it } from "bun:test";
import { followLink, type MainCommandHandlers } from "../use-main-commands";

function handlers(calls: string[]): MainCommandHandlers {
  return {
    active: () => "srv-1",
    goTo: (view) => calls.push(`goTo:${view}`),
    menu: {} as MainCommandHandlers["menu"],
    openSettings: (section) => calls.push(`settings:${section}`),
    readAccount: () => {
      calls.push("readAccount");

      return Promise.resolve();
    },
    select: (project) => calls.push(`select:${project}`),
    switchServer: (id) => {
      calls.push(`switch:${id}`);

      return Promise.resolve();
    },
  };
}

describe("un lien de compte", () => {
  it("relit le compte et ouvre les réglages", async () => {
    const calls: string[] = [];

    await followLink({ kind: "account", query: {} }, handlers(calls));

    expect(calls).toEqual(["readAccount", "settings:account"]);
  });

  it("relit seulement le compte quand la console vient de confirmer l'appareil", async () => {
    const calls: string[] = [];

    await followLink(
      { kind: "account", query: { device: "approved" } },
      handlers(calls)
    );

    expect(calls).toEqual(["readAccount"]);
  });
});
