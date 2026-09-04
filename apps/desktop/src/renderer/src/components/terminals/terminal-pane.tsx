import "@xterm/xterm/css/xterm.css";
import { fitTerminal, focus, obtain } from "@renderer/lib/terminals";
import { useServers } from "@renderer/stores/servers";
import type { TerminalKind } from "@shared/terminals";
import { useEffect, useRef } from "react";
import { CompletionList } from "./completion-list";

interface Props {
  id: string;
  kind: TerminalKind;
  project: string | null;
}

/**
 * A window onto a living terminal.
 *
 * This component owns nothing: it borrows the element held by the registry and
 * gives it back when it unmounts. That is what allows switching tabs or projects
 * without losing a session — and never having to hide a terminal with
 * `display:none`, which would make xterm measure zero rows.
 */
export function TerminalPane({ id, kind, project }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const serverId = useServers((s) => s.config?.active ?? null);

  useEffect(() => {
    const container = host.current;
    if (!(container && serverId)) {
      return;
    }

    const entry = obtain(id, serverId, kind, project);
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
  }, [id, serverId, kind, project]);

  return (
    <div className="relative h-full w-full bg-surface" ref={frame}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: xterm handles keyboard and focus itself */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same reason — the mouse-down only hands focus back to the terminal */}
      <div
        className="h-full w-full cursor-text px-2 py-1"
        onMouseDown={() => focus(id)}
        ref={host}
      />
      {kind === "shell" ? <CompletionList frame={frame} id={id} /> : null}
    </div>
  );
}
