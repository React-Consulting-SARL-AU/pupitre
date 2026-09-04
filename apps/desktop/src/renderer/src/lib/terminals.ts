import type { TerminalKind } from "@shared/contract";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { attach, recompute, TERMINAL_FONT } from "./completion";
import {
  type ResolvedTheme,
  readTokens,
  type TerminalTheme,
  terminalTheme,
} from "./terminal-theme";

let resolved: ResolvedTheme = "light";

/** Read fresh every time: the tokens move when `data-theme` does. */
function currentTheme(): TerminalTheme {
  return terminalTheme(resolved, readTokens(document.documentElement));
}

/**
 * Hands the living terminals their new palette.
 *
 * xterm draws on a canvas, so no CSS variable reaches it: the theme store calls
 * this the moment `data-theme` changes, and every open session repaints where it
 * stands, without losing a line.
 */
export function repaintTerminals(next: ResolvedTheme): void {
  resolved = next;
  const theme = currentTheme();

  for (const entry of live.values()) {
    entry.xterm.options.theme = theme;
  }
}

type Live = {
  host: HTMLDivElement;
  xterm: XTerm;
  fit: FitAddon;
  detach: () => void;
};

/**
 * Terminals live here, outside React.
 *
 * An unmounted xterm loses its screen, and remounting it does not bring it back:
 * the whole session would have to be replayed. Yet the interface moves them
 * constantly — tabs, projects, views. So we keep the instance and its element in
 * this registry, and React only moves that element from one host to another. The
 * remote PTY never knew anything about it.
 */
const live = new Map<string, Live>();

export function obtain(
  id: string,
  kind: TerminalKind,
  project: string | null
): Live {
  const known = live.get(id);
  if (known) {
    return known;
  }

  const host = document.createElement("div");
  host.style.width = "100%";
  host.style.height = "100%";

  const xterm = new XTerm({
    theme: currentTheme(),
    fontFamily: TERMINAL_FONT,
    fontSize: 12,
    lineHeight: 1.3,
    cursorBlink: true,
    scrollback: 8000,
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  xterm.loadAddon(fit);
  xterm.open(host);

  // Only a shell gets completion: Claude, Codex and the dashboard handle their
  // own input, and a list on top of theirs would get in the way.
  const detachCompletion =
    kind === "shell" ? attach(id, xterm) : () => undefined;
  const afterWrite = kind === "shell" ? () => recompute(id) : undefined;

  const detachData = window.pupitre.onTerminalData((payload) => {
    if (payload.id === id) {
      xterm.write(payload.data, afterWrite);
    }
  });
  const detachExit = window.pupitre.onTerminalExit((payload) => {
    if (payload.id === id) {
      xterm.writeln(
        `\r\n\x1b[38;5;245m— session ended (${payload.code}) —\x1b[0m`
      );
    }
  });
  xterm.onData((data) => window.pupitre.writeTerminal(id, data));

  // The PTY opens at a default size: the host is not in the document yet, so
  // nothing is measurable. The first `fitTerminal` will correct it.
  window.pupitre.openTerminal(id, kind, project, 80, 24);

  const entry: Live = {
    host,
    xterm,
    fit,
    detach: () => {
      detachData();
      detachExit();
      detachCompletion();
    },
  };
  live.set(id, entry);

  return entry;
}

/** Resets the PTY to the real size. With no measurable host, we do nothing. */
export function fitTerminal(id: string): void {
  const entry = live.get(id);
  if (!(entry?.host.isConnected && entry.host.clientHeight > 0)) {
    return;
  }
  try {
    entry.fit.fit();
    window.pupitre.resizeTerminal(id, entry.xterm.cols, entry.xterm.rows);
  } catch {
    // The host has just been detached: the next render will retry.
  }
}

export function focus(id: string): void {
  live.get(id)?.xterm.focus();
}

export function destroy(id: string): void {
  const entry = live.get(id);
  if (!entry) {
    return;
  }
  entry.detach();
  window.pupitre.closeTerminal(id);
  entry.xterm.dispose();
  entry.host.remove();
  live.delete(id);
}
