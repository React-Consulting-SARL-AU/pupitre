import "@xterm/xterm/css/xterm.css";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { IconButton } from "@renderer/components/ui/icon-button";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { TerminalShortcut } from "@renderer/lib/terminal-shortcuts";
import { useTerminalStatus } from "@renderer/lib/terminal-status";
import {
  fitTerminal,
  focus,
  obtain,
  onShortcut,
  scrollToBottom,
} from "@renderer/lib/terminals";
import { useServers } from "@renderer/stores/servers";
import { useTerminals } from "@renderer/stores/terminals";
import type { AgentState, TerminalKind, ViewBounds } from "@shared/terminals";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { CompletionList } from "./completion-list";
import { TerminalEndedBar } from "./terminal-ended-bar";
import { TerminalLoginBar } from "./terminal-login-bar";
import { TerminalSearchBar } from "./terminal-search-bar";
import { TerminalStatusBar } from "./terminal-status-bar";

interface Props {
  id: string;
  kind: TerminalKind;
  project: string | null;
  /** The tab in front: the only one a page may be laid over. */
  active: boolean;
  state: AgentState | undefined;
  onClose: () => void;
  /** The shortcuts that move between tabs, answered by whoever holds the row. */
  onShortcut: (shortcut: TerminalShortcut) => void;
}

const OPENING_KEY: Record<TerminalKind, DictionaryKey> = {
  claude: "terminals.openingClaude",
  codex: "terminals.openingCodex",
  hermes: "terminals.openingHermes",
  shell: "terminals.openingShell",
};

function boxOf(element: HTMLElement | null): ViewBounds | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

/**
 * A window onto a living terminal.
 *
 * This component owns nothing: it borrows the element held by the registry and
 * gives it back when it unmounts. That is what allows switching tabs or projects
 * without losing a session — and never having to hide a terminal with
 * `display:none`, which would make xterm measure zero rows.
 */
export function TerminalPane({
  id,
  kind,
  project,
  active,
  state,
  onClose,
  onShortcut: answer,
}: Props) {
  const t = useTranslations();

  const host = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef(answer);
  answerRef.current = answer;

  const serverId = useServers((s) => s.config?.active ?? null);

  const session = useTerminals((s) => s.sessions[id]);
  const loginHost = useTerminals((s) => s.links[id]);
  const loginOpen = useTerminals((s) => s.login === id);
  const searchOpen = useTerminals((s) => s.search === id);
  const start = useTerminals((s) => s.start);
  const restart = useTerminals((s) => s.restart);
  const openLogin = useTerminals((s) => s.openLogin);
  const closeLogin = useTerminals((s) => s.closeLogin);
  const moveLogin = useTerminals((s) => s.moveLogin);
  const closeSearch = useTerminals((s) => s.closeSearch);

  const atBottom = useTerminalStatus(id).atBottom;

  useEffect(() => {
    const container = host.current;
    if (!(container && serverId)) {
      return;
    }

    const entry = obtain(id, kind);
    container.appendChild(entry.host);
    onShortcut(id, (shortcut) => answerRef.current(shortcut));
    start(id, serverId, kind, project);

    const observer = new ResizeObserver(() => {
      fitTerminal(id);

      const bounds = boxOf(stage.current);

      if (bounds) {
        moveLogin(bounds);
      }
    });
    observer.observe(container);
    requestAnimationFrame(() => {
      fitTerminal(id);
      focus(id);
    });

    return () => {
      observer.disconnect();
      onShortcut(id, null);
      entry.host.remove();
    };
  }, [id, serverId, kind, project, start, moveLogin]);

  // A page laid over a tab that is no longer in front would float over another
  // one: it goes away with the tab, and the button that opened it stays.
  useEffect(() => {
    if (!active && loginOpen) {
      closeLogin();
    }
  }, [active, loginOpen, closeLogin]);

  useEffect(() => {
    if (!active && searchOpen) {
      closeSearch();
    }
  }, [active, searchOpen, closeSearch]);

  useEffect(
    () => () => {
      if (useTerminals.getState().login === id) {
        useTerminals.getState().closeLogin();
      }
    },
    [id]
  );

  function reopen(): Promise<void> | undefined {
    return serverId ? restart(id, serverId, kind, project) : undefined;
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface" data-terminal={id}>
      {loginHost ? (
        <TerminalLoginBar
          host={loginHost}
          onClose={closeLogin}
          onOpen={() => {
            const bounds = boxOf(stage.current);

            if (bounds) {
              openLogin(id, bounds);
            }
          }}
          open={loginOpen}
        />
      ) : null}

      <div className="relative min-h-0 flex-1 bg-sunken" ref={stage}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: xterm handles keyboard and focus itself */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same reason — the mouse-down only hands focus back to the terminal */}
        <div
          className="h-full w-full cursor-text px-2 py-1"
          onMouseDown={() => focus(id)}
          ref={host}
        />

        {kind === "shell" ? <CompletionList frame={stage} id={id} /> : null}

        {searchOpen ? (
          <TerminalSearchBar id={id} onClose={closeSearch} />
        ) : null}

        {atBottom || session?.status !== "open" ? null : (
          <div className="absolute right-4 bottom-3 z-10">
            <IconButton
              className="elevation-overlay bg-surface"
              icon={ArrowDown}
              label={t("terminals.scrollToBottom")}
              onClick={() => scrollToBottom(id)}
              size={13}
            />
          </div>
        )}

        {session?.status === "opening" ? (
          <div className="absolute inset-0 grid place-items-center bg-sunken p-6">
            <div className="w-full max-w-md">
              <WaitingNotice
                detail={t(OPENING_KEY[kind])}
                title={t("terminals.opening")}
              />
            </div>
          </div>
        ) : null}

        {session?.status === "failed" ? (
          <div className="absolute inset-0 grid place-items-center bg-sunken p-6">
            <div className="w-full max-w-md">
              <ErrorNotice error={session.error} onRetry={reopen} />
            </div>
          </div>
        ) : null}
      </div>

      {session?.status === "ended" ? (
        <TerminalEndedBar
          code={session.code}
          onClose={onClose}
          onReopen={reopen}
        />
      ) : null}

      <TerminalStatusBar id={id} kind={kind} project={project} state={state} />
    </div>
  );
}
