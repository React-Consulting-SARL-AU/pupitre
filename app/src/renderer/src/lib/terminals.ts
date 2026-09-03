import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import type { TerminalKind } from "@shared/contract";
import { attach, TERMINAL_FONT, recompute } from "./completion";

/** The terminal theme follows the app's, give or take a shade. */
const THEME = {
  background: "#171310",
  foreground: "#f6f2ee",
  cursor: "#ff6a2b",
  selectionBackground: "#3d342e",
  black: "#100d0b",
  red: "#e8705a",
  green: "#4fbe85",
  yellow: "#d9a320",
  blue: "#7aa2c8",
  magenta: "#c88ec0",
  cyan: "#6fb5b0",
  white: "#cdc3ba",
  brightBlack: "#6f645d",
  brightRed: "#ff8a72",
  brightGreen: "#6fd9a0",
  brightYellow: "#f0bc3c",
  brightBlue: "#96bde0",
  brightMagenta: "#dfa8d7",
  brightCyan: "#8dd0cb",
  brightWhite: "#f6f2ee",
};

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
    theme: THEME,
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
  const detachCompletion = kind === "shell" ? attach(id, xterm) : () => undefined;
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
