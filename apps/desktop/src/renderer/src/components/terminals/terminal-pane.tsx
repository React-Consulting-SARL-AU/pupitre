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
  proposeSize,
  scrollToBottom,
} from "@renderer/lib/terminals";
import { useNavigation } from "@renderer/stores/navigation";
import { useServers } from "@renderer/stores/servers";
import { useTerminals } from "@renderer/stores/terminals";
import type { AgentState, TerminalKind } from "@shared/terminals";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { CompletionList } from "./completion-list";
import { TerminalDormantNotice } from "./terminal-dormant-notice";
import { TerminalEndedBar } from "./terminal-ended-bar";
import { TerminalLoginBar } from "./terminal-login-bar";
import { TerminalSearchBar } from "./terminal-search-bar";
import { TerminalStatusBar } from "./terminal-status-bar";

interface Props {
  id: string;
  kind: TerminalKind;
  project: string | null;
  dir?: string | null;
  session: string | null;
  dormant: boolean;
  active: boolean;
  state: AgentState | undefined;
  onClose: () => void;
  onResume: () => void;
  onShortcut: (shortcut: TerminalShortcut) => void;
}

const OPENING_KEY: Record<TerminalKind, DictionaryKey> = {
  claude: "terminals.openingClaude",
  codex: "terminals.openingCodex",
  copilot: "terminals.openingCopilot",
  cursor: "terminals.openingCursor",
  gemini: "terminals.openingGemini",
  hermes: "terminals.openingHermes",
  opencode: "terminals.openingOpencode",
  shell: "terminals.openingShell",
};

export function TerminalPane({
  id,
  kind,
  project,
  dir = null,
  session: attached,
  dormant,
  active,
  state,
  onClose,
  onResume,
  onShortcut: answer,
}: Props) {
  const t = useTranslations();

  const host = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef(answer);
  answerRef.current = answer;

  // Read when the session opens, never a reason to reopen it: the name comes back a moment later.
  const attachedRef = useRef(attached);
  attachedRef.current = attached;

  const serverId = useServers((s) => s.config?.active ?? null);
  const noteSession = useNavigation((s) => s.noteSession);

  const session = useTerminals((s) => s.sessions[id]);
  const login = useTerminals((s) => s.links[id]);
  const searchOpen = useTerminals((s) => s.search === id);
  const start = useTerminals((s) => s.start);
  const restart = useTerminals((s) => s.restart);
  const openLogin = useTerminals((s) => s.openLogin);
  const dismissLogin = useTerminals((s) => s.dismissLogin);
  const closeSearch = useTerminals((s) => s.closeSearch);

  const atBottom = useTerminalStatus(id).atBottom;

  // Borrows the registry's xterm element, so switching tabs never needs display:none (zero rows).
  useEffect(() => {
    const container = host.current;

    if (!(container && serverId) || dormant) {
      return;
    }

    const entry = obtain(id, kind);
    container.appendChild(entry.host);
    onShortcut(id, (shortcut) => answerRef.current(shortcut));

    // Sized once the host is in the page, so the PTY opens at its real size rather than 80×24.
    start(
      id,
      serverId,
      kind,
      project,
      attachedRef.current,
      dir,
      proposeSize(id)
    ).then((named) => {
      if (named) {
        noteSession(id, named);
      }
    });

    const observer = new ResizeObserver(() => fitTerminal(id));
    observer.observe(container);

    const frame = requestAnimationFrame(() => {
      fitTerminal(id);
      focus(id);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      onShortcut(id, null);
      entry.host.remove();
    };
  }, [id, serverId, kind, project, dir, dormant, start, noteSession]);

  useEffect(() => {
    if (!active && searchOpen) {
      closeSearch();
    }
  }, [active, searchOpen, closeSearch]);

  function reopen(): Promise<unknown> | undefined {
    return serverId
      ? restart(
          id,
          serverId,
          kind,
          project,
          attachedRef.current,
          dir,
          proposeSize(id)
        )
      : undefined;
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface" data-terminal={id}>
      {login ? (
        <TerminalLoginBar
          host={login.host}
          onDismiss={() => dismissLogin(id)}
          onOpen={() => openLogin(id)}
          opened={login.opened}
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

        {dormant ? (
          <div className="absolute inset-0 grid place-items-center bg-sunken p-6">
            <TerminalDormantNotice onResume={onResume} />
          </div>
        ) : null}

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
