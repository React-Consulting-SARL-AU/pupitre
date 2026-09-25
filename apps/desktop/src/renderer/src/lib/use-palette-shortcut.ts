import { useEffect } from "react";
import { claimedByTerminal } from "./history-shortcuts";
import { paletteChordOf } from "./palette";
import { isMac } from "./platform";

export function usePaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (claimedByTerminal(event.target)) {
        return;
      }

      if (paletteChordOf(event, isMac)) {
        event.preventDefault();
        onOpen();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
