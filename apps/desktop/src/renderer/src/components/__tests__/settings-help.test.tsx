import { describe, expect, it } from "bun:test";
import { mount } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { SettingsAboutHelp } from "../settings/settings-about-help";

describe("l'aide dans les réglages", () => {
  it("mène à la documentation, au support et aux conditions, dans la langue de l'app", async () => {
    const opened: unknown[][] = [];

    stubPupitre({
      openHelp: (link, language) => {
        opened.push([link, language]);

        return Promise.resolve();
      },
    });

    const view = await mount(<SettingsAboutHelp />);
    const buttons = [...view.container.querySelectorAll("button")];

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Documentation",
      "Contacter le support",
      "Conditions et confidentialité",
    ]);

    for (const button of buttons) {
      await view.click(button);
    }

    expect(opened.map(([link]) => link)).toEqual(["docs", "support", "legal"]);
    expect(opened[0]?.[1]).toBe("fr");

    view.unmount();
  });
});
