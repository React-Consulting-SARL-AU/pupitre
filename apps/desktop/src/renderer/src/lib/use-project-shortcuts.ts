import { useEffect } from "react";
import { isMac } from "./platform";
import { projectShortcutOf, tabAfter } from "./project-shortcuts";

/** Captured on the way down, or a session's own key handler would hand the chord to the shell first. */
export function useProjectShortcuts<T>(
  tabs: readonly T[],
  active: T,
  onSelect: (tab: T) => void
): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = projectShortcutOf(event, isMac);

      if (!shortcut) {
        return;
      }

      const target = tabAfter(tabs, active, shortcut);

      if (target !== null) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(target);
      }
    };

    window.addEventListener("keydown", onKey, true);

    return () => window.removeEventListener("keydown", onKey, true);
  }, [tabs, active, onSelect]);
}
