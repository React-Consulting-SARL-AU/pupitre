import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isMac } from "@renderer/lib/platform";
import {
  chordLabel,
  type TerminalShortcut,
} from "@renderer/lib/terminal-shortcuts";
import { clearScreen } from "@renderer/lib/terminals";
import { useTerminals } from "@renderer/stores/terminals";
import type {
  AgentState,
  Terminal as TerminalInfo,
  TerminalKind,
} from "@shared/terminals";
import { Eraser, Search, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import { TerminalNewButton } from "./terminal-new-button";
import { TerminalPane } from "./terminal-pane";
import { TerminalTab } from "./terminal-tab";

/**
 * The sessions of one project — or of the server — side by side, whatever
 * their kind: a shell next to a Claude next to a Codex.
 *
 * None is unmounted when you move to the next: they are all rendered, and only
 * the active one gets opacity and events. A terminal hidden by `display:none`
 * would measure zero rows, and the session brought back to the front would draw
 * itself crooked.
 *
 * The row is a tab list in the keyboard's sense too: the arrows move between
 * sessions, and the shortcuts a terminal catches — new, close, next, search —
 * land here, where the row knows its neighbours. "New" from a session opens
 * another of its kind.
 */
export function TerminalTabs({
  sessions,
  active,
  states,
  kinds,
  project,
  onActivate,
  onNew,
  onClose,
  onRename,
}: {
  sessions: readonly TerminalInfo[];
  active: string | null;
  states: Record<string, AgentState>;
  /** What the "+" can open here: the shell, and the agents the machine holds. */
  kinds: readonly TerminalKind[];
  project: string | null;
  onActivate: (id: string) => void;
  onNew: (kind: TerminalKind) => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const t = useTranslations();

  const search = useTerminals((s) => s.search);
  const openSearch = useTerminals((s) => s.openSearch);
  const closeSearch = useTerminals((s) => s.closeSearch);

  const chord = chordLabel(isMac);

  function sibling(id: string, step: number): string | null {
    const index = sessions.findIndex((session) => session.id === id);

    if (index === -1 || sessions.length === 0) {
      return null;
    }

    return sessions[(index + step + sessions.length) % sessions.length].id;
  }

  function activateSibling(id: string, step: number): void {
    const next = sibling(id, step);

    if (next) {
      onActivate(next);
    }
  }

  function toggleSearch(id: string): void {
    if (search === id) {
      closeSearch();
    } else {
      openSearch(id);
    }
  }

  function answer(id: string, shortcut: TerminalShortcut): void {
    switch (shortcut.kind) {
      case "new":
        onNew(sessions.find((session) => session.id === id)?.kind ?? "shell");
        return;
      case "close":
        onClose(id);
        return;
      case "next":
        activateSibling(id, 1);
        return;
      case "previous":
        activateSibling(id, -1);
        return;
      case "tab": {
        const target = sessions[shortcut.index];

        if (target) {
          onActivate(target.id);
        }

        return;
      }
      case "search":
        toggleSearch(id);
        return;
      default:
        return;
    }
  }

  function onListKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (!active) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      activateSibling(active, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      activateSibling(active, -1);
    } else if (event.key === "Home" && sessions[0]) {
      event.preventDefault();
      onActivate(sessions[0].id);
    } else if (event.key === "End" && sessions.at(-1)) {
      event.preventDefault();
      onActivate((sessions.at(-1) as TerminalInfo).id);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-line border-b bg-surface px-2 py-1.5">
        <div
          aria-label={t("terminals.tabs")}
          className="flex min-w-0 items-center gap-1 overflow-x-auto"
          onKeyDown={onListKey}
          role="tablist"
        >
          {sessions.map((session) => (
            <TerminalTab
              active={session.id === active}
              chord={chord}
              key={session.id}
              onActivate={() => onActivate(session.id)}
              onClose={() => onClose(session.id)}
              onRename={(title) => onRename(session.id, title)}
              session={session}
              state={states[session.id]}
            />
          ))}
        </div>

        <TerminalNewButton chord={chord} kinds={kinds} onNew={onNew} />

        {active ? (
          <div className="ml-auto flex shrink-0 items-center gap-0.5 border-line border-l pl-1.5">
            <IconButton
              icon={X}
              label={t("terminals.closeTabHint", { chord })}
              onClick={() => onClose(active)}
              size={12}
              variant="discreet"
            />
            <IconButton
              className={search === active ? "bg-raised text-ink" : ""}
              icon={Search}
              label={t("terminals.search.open", { chord })}
              onClick={() => toggleSearch(active)}
              size={12}
              variant="discreet"
            />
            <IconButton
              icon={Eraser}
              label={t("terminals.clearHint", { chord })}
              onClick={() => clearScreen(active)}
              size={12}
              variant="discreet"
            />
          </div>
        ) : null}
      </div>

      {/* The panes stack by z-index; isolated, they never paint over a dialog. */}
      <div className="relative isolate min-h-0 flex-1">
        {sessions.map((session) => (
          <div
            className="absolute inset-0"
            key={session.id}
            style={{
              opacity: session.id === active ? 1 : 0,
              pointerEvents: session.id === active ? "auto" : "none",
              zIndex: session.id === active ? 1 : 0,
            }}
          >
            <TerminalPane
              active={session.id === active}
              dir={session.dir}
              dormant={session.dormant}
              id={session.id}
              kind={session.kind}
              onClose={() => onClose(session.id)}
              onResume={() => onActivate(session.id)}
              onShortcut={(shortcut) => answer(session.id, shortcut)}
              project={project}
              session={session.session}
              state={states[session.id]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
