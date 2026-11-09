import "@xterm/xterm/css/xterm.css";
import type { Process } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { CheckLine } from "@renderer/components/ui/check-line";
import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Select } from "@renderer/components/ui/select";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isMac } from "@renderer/lib/platform";
import { chordLabel } from "@renderer/lib/terminal-shortcuts";
import { useTerminalStatus } from "@renderer/lib/terminal-status";
import {
  allowInput,
  clearScreen,
  copyWholeOutput,
  destroy,
  fitTerminal,
  focus,
  obtain,
  onShortcut,
  scrollToBottom,
} from "@renderer/lib/terminals";
import { useProcessConsole } from "@renderer/stores/process-console";
import { useTerminals } from "@renderer/stores/terminals";
import { ArrowDown, Eraser, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TerminalSearchBar } from "../terminals/terminal-search-bar";

function toggleSearch(id: string): void {
  const terminals = useTerminals.getState();

  if (terminals.search === id) {
    terminals.closeSearch();
  } else {
    terminals.openSearch(id);
  }
}

interface Props {
  serverId: string;
  project: string;
  /** Main process first: it is the one shown by default. */
  processes: readonly Process[];
  chosen: string | null;
  onChoose: (process: string) => void;
}

/** The process's own tmux window, live: a full-screen program such as Turbo draws here exactly as in a terminal. */
export function ProjectConsole({
  serverId,
  project,
  processes,
  chosen,
  onChoose,
}: Props) {
  const t = useTranslations();

  const process =
    processes.find((candidate) => candidate.id === chosen) ?? processes[0];
  const id = `console-${serverId}-${project}-${process?.id}`;
  const target = useMemo(
    () => ({ id, process: process?.id ?? "", project, serverId }),
    [id, process?.id, project, serverId]
  );

  const host = useRef<HTMLDivElement | null>(null);
  const [inputFor, setInputFor] = useState<string | null>(null);
  const input = inputFor === id;

  const state = useProcessConsole((s) => s.consoles[id]);
  const open = useProcessConsole((s) => s.open);
  const ended = useProcessConsole((s) => s.ended);
  const close = useProcessConsole((s) => s.close);
  const searchOpen = useTerminals((s) => s.search === id);
  const closeSearch = useTerminals((s) => s.closeSearch);
  const atBottom = useTerminalStatus(id).atBottom;

  useEffect(() => {
    const container = host.current;

    if (!(container && target.process)) {
      return;
    }

    const entry = obtain(id, "process");
    container.appendChild(entry.host);

    onShortcut(id, (shortcut) => {
      if (shortcut.kind === "search") {
        toggleSearch(id);
      }
    });

    const stopExit = window.pupitre.onTerminalExit((payload) => {
      if (payload.id === id) {
        ended(target);
      }
    });

    const observer = new ResizeObserver(() => fitTerminal(id));
    observer.observe(container);

    // Measured first, so the window is attached at the console's size rather than 80×24.
    const frame = requestAnimationFrame(() => {
      fitTerminal(id);
      open(target);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stopExit();
      onShortcut(id, null);
      close(id);
      destroy(id);
    };
  }, [id, target, open, ended, close]);

  useEffect(() => {
    allowInput(id, input);

    if (input) {
      focus(id);
    }
  }, [id, input]);

  // A stopped process shows its journal; the next run's window is what to come back to.
  const runState = process?.state;
  const seenState = useRef(runState);

  useEffect(() => {
    if (seenState.current === runState) {
      return;
    }

    seenState.current = runState;

    if (
      useProcessConsole.getState().consoles[target.id]?.status === "journal"
    ) {
      open(target);
    }
  }, [runState, target, open]);

  if (!process) {
    return (
      <p className="p-6 text-ink-3 text-small">
        {t("project.console.none", { name: project })}
      </p>
    );
  }

  const name = processes.length > 1 ? `${project}/${process.id}` : project;
  const chord = chordLabel(isMac);

  return (
    <div className="flex h-full flex-col" data-console={process.id}>
      <div className="flex flex-wrap items-center gap-3 border-line border-b px-4 py-2">
        <span className="font-data text-ink-3 text-small">
          {t("project.console.label", { name })}
        </span>

        {processes.length > 1 ? (
          <Select
            aria-label={t("project.console.process")}
            className="w-auto py-0.5 text-small"
            kind="data"
            onChange={onChoose}
            options={processes.map((held) => ({
              label: held.id,
              value: held.id,
            }))}
            value={process.id}
          />
        ) : null}

        <CheckLine
          checked={input}
          disabled={state?.status !== "live"}
          label={t("project.console.input")}
          name="project-console-input"
          onChange={(next) => setInputFor(next ? id : null)}
          size="sm"
        />

        <div className="ml-auto flex items-center gap-1.5">
          <IconButton
            className={searchOpen ? "bg-raised text-ink" : ""}
            icon={Search}
            label={t("terminals.search.open", { chord })}
            onClick={() => toggleSearch(id)}
            size={12}
            variant="discreet"
          />
          <CopyButton
            hint={t("project.console.copyAllHint")}
            onCopy={() => copyWholeOutput(id)}
          >
            {t("project.console.copyAll")}
          </CopyButton>
          <Button
            hint={t("project.console.clearHint")}
            icon={Eraser}
            onClick={() => clearScreen(id)}
            size="sm"
          >
            {t("project.console.clear")}
          </Button>
        </div>
      </div>

      {state?.status === "journal" ? (
        <p
          className="border-line border-b px-4 py-2 text-caption text-ink-3"
          data-console-journal={state.why.code}
        >
          {state.why.code === "unknown_command"
            ? [state.why.message, state.why.fix].filter(Boolean).join(" ")
            : t("project.console.stopped", { name })}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-sunken">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: xterm handles keyboard and focus itself */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same reason — the mouse-down only hands focus back to the terminal */}
        <div
          className="h-full w-full px-2 py-1"
          onMouseDown={() => focus(id)}
          ref={host}
        />

        {searchOpen ? (
          <TerminalSearchBar id={id} onClose={closeSearch} />
        ) : null}

        {atBottom || state?.status === "opening" ? null : (
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

        {state?.status === "opening" ? (
          <div className="absolute inset-x-0 top-0 p-4">
            <WaitingLine>{t("project.console.opening", { name })}</WaitingLine>
          </div>
        ) : null}

        {state?.status === "failed" ? (
          <div className="absolute inset-0 grid place-items-center bg-sunken p-6">
            <div className="w-full max-w-md">
              <ErrorNotice error={state.error} onRetry={() => open(target)} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
