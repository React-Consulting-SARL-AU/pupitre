import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mount } from "../../__tests__/dom";
import { CopyField } from "../ui/copy-field";

const FEEDBACK_MS = 1600;

const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  mock.restore();

  if (clipboard) {
    Object.defineProperty(navigator, "clipboard", clipboard);
  }
});

describe("un champ à copier", () => {
  it("ne laisse aucun minuteur courir après son démontage", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });

    const scheduled = spyOn(globalThis, "setTimeout");
    const cleared = spyOn(globalThis, "clearTimeout");

    const view = await mount(
      <CopyField label="Clé" value="ssh-ed25519 AAAA" />
    );

    await view.click(view.container.querySelector("button"));

    const feedback = scheduled.mock.results.find(
      (_result, index) => scheduled.mock.calls[index]?.[1] === FEEDBACK_MS
    )?.value;

    view.unmount();

    expect(feedback).toBeDefined();
    expect(cleared).toHaveBeenCalledWith(feedback);
  });
});
