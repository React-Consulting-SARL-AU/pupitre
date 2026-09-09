import { translate } from "@renderer/i18n/translate";
import type { ResolvedTheme } from "@shared/appearance";
import type { TerminalKind } from "@shared/terminals";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { attach, completionKey, recompute, TERMINAL_FONT } from "./completion";
import { isMac } from "./platform";
import { shortcutOf, type TerminalShortcut } from "./terminal-shortcuts";
import { forgetStatus, noteStatus } from "./terminal-status";
import {
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

/** A match is drawn in the theme's own greys, read off the tokens at search time. */
function searchDecorations() {
  const token = readTokens(document.documentElement);

  return {
    activeMatchBackground: token("--line-strong"),
    activeMatchColorOverviewRuler: token("--ink"),
    matchBackground: token("--raised"),
    matchOverviewRuler: token("--ink-4"),
  };
}

const FONT_SIZE = 13;
const FONT_STEP = 1;
const FONT_MIN = 9;
const FONT_MAX = 24;

let fontSize = FONT_SIZE;

/** The shortcuts the registry cannot answer alone: they move tabs, and tabs are React's. */
export type ShortcutHandler = (shortcut: TerminalShortcut) => void;

interface Live {
  host: HTMLDivElement;
  xterm: XTerm;
  fit: FitAddon;
  search: SearchAddon;
  onShortcut: ShortcutHandler | null;
  detach: () => void;
}

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

function publishScroll(id: string, xterm: XTerm): void {
  const buffer = xterm.buffer.active;

  noteStatus(id, { atBottom: buffer.viewportY >= buffer.baseY });
}

/**
 * The keys the app answers itself, before the shell or the completion see them.
 *
 * What only touches this terminal — the screen, the clipboard, the type size —
 * is done here. What touches the tabs goes to whoever mounted the pane.
 */
function answerShortcut(id: string, shortcut: TerminalShortcut): void {
  const entry = live.get(id);

  if (!entry) {
    return;
  }

  switch (shortcut.kind) {
    case "clear":
      entry.xterm.clear();
      return;
    case "copy":
      copySelection(id);
      return;
    case "paste":
      paste(id);
      return;
    case "zoomIn":
      zoom(1);
      return;
    case "zoomOut":
      zoom(-1);
      return;
    case "zoomReset":
      zoom(0);
      return;
    default:
      entry.onShortcut?.(shortcut);
  }
}

export function obtain(id: string, kind: TerminalKind): Live {
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
    fontSize,
    lineHeight: 1.3,
    cursorBlink: true,
    scrollback: 8000,
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  xterm.loadAddon(fit);
  xterm.loadAddon(search);
  xterm.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      window.pupitre.openUrl(uri);
    })
  );
  xterm.open(host);

  // Only a shell gets completion: Claude, Codex and the dashboard handle their
  // own input, and a list on top of theirs would get in the way.
  const detachCompletion =
    kind === "shell" ? attach(id, xterm) : () => undefined;
  const afterWrite = () => {
    publishScroll(id, xterm);

    if (kind === "shell") {
      recompute(id);
    }
  };

  xterm.attachCustomKeyEventHandler((event) => {
    const shortcut = shortcutOf(event, isMac);

    if (shortcut) {
      event.preventDefault();
      answerShortcut(id, shortcut);

      return false;
    }

    return kind === "shell" ? completionKey(id, event) : true;
  });

  const scrolled = xterm.onScroll(() => publishScroll(id, xterm));
  const matched = search.onDidChangeResults(({ resultIndex, resultCount }) => {
    noteStatus(id, { matches: { count: resultCount, index: resultIndex } });
  });

  const detachData = window.pupitre.onTerminalData((payload) => {
    if (payload.id === id) {
      xterm.write(payload.data, afterWrite);
    }
  });
  const detachExit = window.pupitre.onTerminalExit((payload) => {
    if (payload.id === id) {
      xterm.writeln(
        `\r\n\x1b[38;5;245m— ${translate()("terminals.sessionEnded", {
          code: payload.code,
        })} —\x1b[0m`
      );
    }
  });
  xterm.onData((data) => window.pupitre.writeTerminal(id, data));

  const entry: Live = {
    host,
    xterm,
    fit,
    search,
    onShortcut: null,
    detach: () => {
      detachData();
      detachExit();
      detachCompletion();
      scrolled.dispose();
      matched.dispose();
    },
  };
  live.set(id, entry);

  return entry;
}

/** Whoever mounts the pane answers the shortcuts that move between tabs. */
export function onShortcut(id: string, handler: ShortcutHandler | null): void {
  const entry = live.get(id);

  if (entry) {
    entry.onShortcut = handler;
  }
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
    noteStatus(id, { cols: entry.xterm.cols, rows: entry.xterm.rows });
  } catch {
    // The host has just been detached: the next render will retry.
  }
}

export function focus(id: string): void {
  live.get(id)?.xterm.focus();
}

export function scrollToBottom(id: string): void {
  live.get(id)?.xterm.scrollToBottom();
}

export function clearScreen(id: string): void {
  live.get(id)?.xterm.clear();
}

export function copySelection(id: string): void {
  const entry = live.get(id);

  if (entry?.xterm.hasSelection()) {
    navigator.clipboard.writeText(entry.xterm.getSelection());
  }
}

export async function paste(id: string): Promise<void> {
  const entry = live.get(id);

  if (!entry) {
    return;
  }

  const text = await navigator.clipboard.readText();

  entry.xterm.paste(text);
}

/**
 * One type size for every session: a reader who leans in leans in everywhere.
 * Zero puts it back where the design put it.
 */
export function zoom(step: -1 | 0 | 1): void {
  const next =
    step === 0
      ? FONT_SIZE
      : Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize + step * FONT_STEP));

  if (next === fontSize) {
    return;
  }

  fontSize = next;

  for (const [id, entry] of live) {
    entry.xterm.options.fontSize = fontSize;
    fitTerminal(id);
  }
}

export function currentFontSize(): number {
  return fontSize;
}

/**
 * Looks for the term, forwards or back. Typing searches incrementally — the
 * selection grows with the word — while Enter jumps to the next occurrence.
 */
export function find(
  id: string,
  term: string,
  direction: "next" | "previous",
  incremental = false
): boolean {
  const entry = live.get(id);

  if (!entry) {
    return false;
  }

  const options = { decorations: searchDecorations(), incremental };

  return direction === "next"
    ? entry.search.findNext(term, options)
    : entry.search.findPrevious(term, options);
}

export function clearFind(id: string): void {
  live.get(id)?.search.clearDecorations();
  noteStatus(id, { matches: null });
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
  forgetStatus(id);
}
