import { useEffect } from "react";
import { claimedByTerminal } from "./history-shortcuts";
import { paletteChordOf } from "./palette";
import { isMac } from "./platform";

/** ⌘K or Ctrl+K anywhere in the window, except inside a terminal, which owns it. */
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
