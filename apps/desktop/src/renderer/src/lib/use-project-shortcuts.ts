import { useEffect } from "react";
import { isMac } from "./platform";
import { projectShortcutOf, tabAfter } from "./project-shortcuts";

/**
 * The keyboard walks the tabs of a project page.
 *
 * Caught on the way down rather than on the way up: a session's own key
 * handler sits between the shell and the window, and the chord must reach
 * the page before it reaches the shell.
 */
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
