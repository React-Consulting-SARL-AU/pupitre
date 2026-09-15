import { translate } from "@renderer/i18n/translate";
import type { ResolvedTheme } from "@shared/appearance";
import type { TerminalEnd, TerminalKind } from "@shared/terminals";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import { attach, completionKey, recompute } from "./completion";
import { isMac } from "./platform";
import { addressProvider } from "./terminal-links";
import {
  DEFAULT_TERMINAL_SETTINGS,
  FONT_STACKS,
  steppedFontSize,
  type TerminalSettings,
} from "./terminal-settings";
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

/**
 * The look every session is given, and follows when it changes.
 *
 * The settings store owns the choice and writes it down; this is the copy the
 * registry reads when it opens a terminal, and what `applyTerminalSettings`
 * hands to the ones already open.
 */
let settings: TerminalSettings = DEFAULT_TERMINAL_SETTINGS;

/** Whoever holds the choice is told when a shortcut changes the size. */
let onSettingsChange: ((patch: Partial<TerminalSettings>) => void) | null =
  null;

export function followTerminalSettings(
  handler: ((patch: Partial<TerminalSettings>) => void) | null
): void {
  onSettingsChange = handler;
}

/**
 * Hands the living terminals their new look, without losing a line.
 *
 * The face and the size change the cell, so every session is refitted; the
 * scrollback and the blink take effect as they are.
 */
export function applyTerminalSettings(next: TerminalSettings): void {
  const refit =
    next.fontSize !== settings.fontSize ||
    next.fontFamily !== settings.fontFamily;

  settings = next;

  for (const [id, entry] of live) {
    entry.xterm.options.fontSize = next.fontSize;
    entry.xterm.options.fontFamily = FONT_STACKS[next.fontFamily];
    entry.xterm.options.scrollback = next.scrollback;
    entry.xterm.options.cursorBlink = next.cursorBlink;

    if (refit) {
      fitTerminal(id);
    }
  }
}

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

/**
 * The GPU renderer, when this window has one to give.
 *
 * A context that cannot be made — a headless run, a driver that refuses — or
 * one lost later leaves the addon disposed and xterm on its DOM renderer: the
 * session draws either way, only slower.
 */
function drawWithWebgl(xterm: XTerm): void {
  try {
    const webgl = new WebglAddon();

    webgl.onContextLoss(() => webgl.dispose());
    xterm.loadAddon(webgl);
  } catch {
    // The DOM renderer stands in.
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

  const openInBrowser = (uri: string) =>
    window.pupitre.openTerminalUrl(id, uri);

  const xterm = new XTerm({
    theme: currentTheme(),
    fontFamily: FONT_STACKS[settings.fontFamily],
    fontSize: settings.fontSize,
    lineHeight: 1.3,
    cursorBlink: settings.cursorBlink,
    scrollback: settings.scrollback,
    allowProposedApi: true,
    macOptionClickForcesSelection: true,
    // Without a handler xterm asks with confirm() and opens a window the app denies.
    linkHandler: {
      activate: (_event, uri) => openInBrowser(uri),
    },
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  xterm.loadAddon(fit);
  xterm.loadAddon(search);
  xterm.loadAddon(new Unicode11Addon());
  xterm.unicode.activeVersion = "11";
  xterm.registerLinkProvider(addressProvider(xterm, openInBrowser));
  xterm.open(host);
  drawWithWebgl(xterm);
  host.addEventListener("mousedown", keepSelectionOurs, true);

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

/**
 * The size the host would give a session, measured before the PTY is opened.
 *
 * A PTY opened at 80×24 and resized a frame later makes every full-screen
 * program draw twice; measuring first opens it at the right size. Without a
 * measurable host there is nothing to say, and the caller's default stands.
 */
export function proposeSize(id: string): { cols: number; rows: number } | null {
  const entry = live.get(id);

  if (!(entry?.host.isConnected && entry.host.clientHeight > 0)) {
    return null;
  }

  const proposed = entry.fit.proposeDimensions();

  return proposed && proposed.cols > 0 && proposed.rows > 0
    ? { cols: proposed.cols, rows: proposed.rows }
    : null;
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

/**
 * A drag on the text selects it, whatever the program on the other side asked.
 *
 * A full-screen agent turns mouse reporting on for its scrolling, and xterm
 * then hands every press to it: nothing can be selected or copied until the
 * program quits. Wheel events still reach it; a press reads as the modifier
 * xterm takes for "select anyway", on every platform.
 */
function keepSelectionOurs(event: MouseEvent): void {
  if (event.button !== 0 || event.altKey || event.shiftKey) {
    return;
  }

  Object.defineProperty(event, isMac ? "altKey" : "shiftKey", { value: true });
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
 * Everything the screen holds, scrollback included, as plain text.
 *
 * Read off the buffer row by row rather than replayed: a full-screen agent
 * draws on the alternate screen with cursor moves in place of line breaks,
 * and a replay stripped of them ran its rows together. A row xterm wrapped
 * is glued back to the one before it; the blank rows under the last word go.
 */
export function wholeOutput(id: string): string | null {
  const entry = live.get(id);

  if (!entry) {
    return null;
  }

  const buffer = entry.xterm.buffer.active;
  const lines: string[] = [];

  for (let y = 0; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    if (!line) {
      continue;
    }

    const text = line.translateToString(true);

    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text;
    } else {
      lines.push(text);
    }
  }

  return lines.join("\n").trimEnd();
}

export async function copyWholeOutput(id: string): Promise<void> {
  const text = wholeOutput(id);

  if (text !== null) {
    await navigator.clipboard.writeText(text);
  }
}

/**
 * One type size for every session: a reader who leans in leans in everywhere.
 * Zero puts it back where the design put it. The choice goes to whoever holds
 * the settings, so it is written down like one made from the preferences.
 */
export function zoom(step: -1 | 0 | 1): void {
  const next = steppedFontSize(settings.fontSize, step);

  if (next === settings.fontSize) {
    return;
  }

  if (onSettingsChange) {
    onSettingsChange({ fontSize: next });
  } else {
    applyTerminalSettings({ ...settings, fontSize: next });
  }
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

/** `end` names the session to kill with the tab; without it the pipe is only let go of. */
export function destroy(id: string, end: TerminalEnd | null = null): void {
  const entry = live.get(id);

  window.pupitre.closeTerminal(id, end);

  if (!entry) {
    return;
  }
  entry.detach();
  entry.xterm.dispose();
  entry.host.remove();
  live.delete(id);
  forgetStatus(id);
}
