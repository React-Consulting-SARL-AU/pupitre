import "@xterm/xterm/css/xterm.css";
import type { TerminalKind } from "@shared/contract";
import { useEffect, useRef } from "react";
import { fitTerminal, focus, obtain } from "../lib/terminals";
import { Completion } from "./Completion";

type Props = {
  id: string;
  kind: TerminalKind;
  project: string | null;
};

/**
 * A window onto a living terminal.
 *
 * This component owns nothing: it borrows the element held by the registry and
 * gives it back when it unmounts. That is what allows switching tabs or projects
 * without losing a session — and never having to hide a terminal with
 * `display:none`, which would make xterm measure zero rows.
 */
export function Terminal({ id, kind, project }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) {
      return;
    }

    const entry = obtain(id, kind, project);
    container.appendChild(entry.host);

    const observer = new ResizeObserver(() => fitTerminal(id));
    observer.observe(container);
    requestAnimationFrame(() => {
      fitTerminal(id);
      focus(id);
    });

    return () => {
      observer.disconnect();
      entry.host.remove();
    };
  }, [id, kind, project]);

  return (
    <div className="relative h-full w-full bg-surface" ref={frame}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: xterm handles keyboard and focus itself */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same reason — the mouse-down only hands focus back to the terminal */}
      <div
        className="h-full w-full cursor-text px-2 py-1"
        onMouseDown={() => focus(id)}
        ref={host}
      />
      {kind === "shell" ? <Completion frame={frame} id={id} /> : null}
    </div>
  );
}
