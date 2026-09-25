import { useNavigation } from "@renderer/stores/navigation";
import { useEffect } from "react";
import {
  claimedByTerminal,
  historyStepOf,
  historyStepOfButton,
} from "./history-shortcuts";
import { isMac } from "./platform";

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
