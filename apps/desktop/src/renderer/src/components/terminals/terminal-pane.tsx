import "@xterm/xterm/css/xterm.css";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { fitTerminal, focus, obtain } from "@renderer/lib/terminals";
import { useServers } from "@renderer/stores/servers";
import { useTerminals } from "@renderer/stores/terminals";
import type { TerminalKind, ViewBounds } from "@shared/terminals";
import { useEffect, useRef } from "react";
import { CompletionList } from "./completion-list";
import { TerminalLoginBar } from "./terminal-login-bar";

interface Props {
  id: string;
  kind: TerminalKind;
  project: string | null;
  /** The tab in front: the only one a page may be laid over. */
  active: boolean;
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
export function TerminalPane({ id, kind, project, active }: Props) {
  const t = useTranslations();

  const host = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const serverId = useServers((s) => s.config?.active ?? null);

  const session = useTerminals((s) => s.sessions[id]);
  const loginHost = useTerminals((s) => s.links[id]);
  const loginOpen = useTerminals((s) => s.login === id);
  const start = useTerminals((s) => s.start);
  const forget = useTerminals((s) => s.forget);
  const openLogin = useTerminals((s) => s.openLogin);
  const closeLogin = useTerminals((s) => s.closeLogin);
  const moveLogin = useTerminals((s) => s.moveLogin);

  useEffect(() => {
    const container = host.current;
    if (!(container && serverId)) {
      return;
    }

    const entry = obtain(id, kind);
    container.appendChild(entry.host);
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

  useEffect(
    () => () => {
      if (useTerminals.getState().login === id) {
        useTerminals.getState().closeLogin();
      }
    },
    [id]
  );

  return (
    <div className="flex h-full w-full flex-col bg-surface">
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

      <div className="relative min-h-0 flex-1" ref={stage}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: xterm handles keyboard and focus itself */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same reason — the mouse-down only hands focus back to the terminal */}
        <div
          className="h-full w-full cursor-text px-2 py-1"
          onMouseDown={() => focus(id)}
          ref={host}
        />

        {kind === "shell" ? <CompletionList frame={stage} id={id} /> : null}

        {session?.status === "opening" ? (
          <div className="absolute inset-x-0 top-0 p-4">
            <WaitingNotice
              detail={t(OPENING_KEY[kind])}
              title={t("terminals.opening")}
            />
          </div>
        ) : null}

        {session?.status === "failed" ? (
          <div className="absolute inset-x-0 top-0 p-4">
            <ErrorNotice
              error={session.error}
              onRetry={() => {
                forget(id);

                if (serverId) {
                  start(id, serverId, kind, project);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
