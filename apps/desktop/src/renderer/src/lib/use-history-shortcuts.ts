import { useNavigation } from "@renderer/stores/navigation";
import { useEffect } from "react";
import {
  claimedByTerminal,
  historyStepOf,
  historyStepOfButton,
} from "./history-shortcuts";
import { isMac } from "./platform";

/**
 * The keyboard and the mouse walk the history the way the arrows do.
 *
 * A terminal keeps its own keys: inside one, and on its row of tabs, the same
 * chord moves between its tabs, and the shell must not answer it a second time.
 */
export function useHistoryShortcuts(): void {
  useEffect(() => {
    const walk = (step: "back" | "forward") =>
      step === "back"
        ? useNavigation.getState().back()
        : useNavigation.getState().forward();

    const onKey = (event: KeyboardEvent) => {
      if (claimedByTerminal(event.target)) {
        return;
      }

      const step = historyStepOf(event, isMac);

      if (step) {
        event.preventDefault();
        walk(step);
      }
    };

    const onMouse = (event: MouseEvent) => {
      const step = historyStepOfButton(event.button);

      if (step) {
        event.preventDefault();
        walk(step);
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, []);
}
