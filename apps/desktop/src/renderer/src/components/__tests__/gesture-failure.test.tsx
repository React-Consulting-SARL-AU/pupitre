import { describe, expect, it } from "bun:test";
import { act } from "react";
import { mount } from "../../__tests__/dom";
import { useGestureFailure } from "../../stores/gesture-failure";
import { GestureFailureNotice } from "../shell/gesture-failure-notice";

describe("un geste qui échoue sans que l'écran le dise", () => {
  it("se lit au pied de la fenêtre jusqu'à ce qu'on le range", async () => {
    useGestureFailure.getState().dismiss();

    const view = await mount(<GestureFailureNotice />);

    expect(view.container.textContent).toBe("");

    await act(() => {
      useGestureFailure
        .getState()
        .fail("L'action s'est arrêtée sur une erreur : timeout");
    });

    expect(view.container.querySelector("[role=alert]")?.textContent).toBe(
      "L'action s'est arrêtée sur une erreur : timeout"
    );

    await view.click(view.container.querySelector("button"));

    expect(useGestureFailure.getState().failure).toBeNull();
    expect(view.container.textContent).toBe("");

    view.unmount();
  });
});
