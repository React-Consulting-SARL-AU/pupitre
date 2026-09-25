import { translate } from "@renderer/i18n/translate";
import type { ResolvedTheme } from "@shared/appearance";
import type { TerminalEnd, TerminalKind } from "@shared/terminals";
import { ClipboardAddon } from "@xterm/addon-clipboard";
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

// Read fresh every time: the tokens move when `data-theme` does.
function currentTheme(): TerminalTheme {
  return terminalTheme(resolved, readTokens(document.documentElement));
}

/** xterm draws on a canvas that no CSS variable reaches, so a theme change is pushed here. */
export function repaintTerminals(next: ResolvedTheme): void {
  resolved = next;

  const theme = currentTheme();

  for (const entry of live.values()) {
    entry.xterm.options.theme = theme;
  }
}

function searchDecorations() {
  const token = readTokens(document.documentElement);

  return {
    activeMatchBackground: token("--line-strong"),
    activeMatchColorOverviewRuler: token("--ink"),
    matchBackground: token("--raised"),
    matchOverviewRuler: token("--ink-4"),
  };
}

// The registry's copy; the settings store owns the choice and writes it down.
let settings: TerminalSettings = DEFAULT_TERMINAL_SETTINGS;

let onSettingsChange: ((patch: Partial<TerminalSettings>) => void) | null =
  null;

export function followTerminalSettings(
  handler: ((patch: Partial<TerminalSettings>) => void) | null
): void {
  onSettingsChange = handler;
}

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

/** For the shortcuts that move tabs, which only React can answer. */
export type ShortcutHandler = (shortcut: TerminalShortcut) => void;

interface Live {
  host: HTMLDivElement;
  xterm: XTerm;
  fit: FitAddon;
  search: SearchAddon;
  onShortcut: ShortcutHandler | null;
  detach: () => void;
}

// One bridge listener dispatching by id: one per terminal woke them all on every chunk.
const dataListeners = new Map<string, Set<(data: string) => void>>();

let bridgeInstalled = false;

function onTerminalData(
  id: string,
  listener: (data: string) => void
): () => void {
  if (!bridgeInstalled) {
    bridgeInstalled = true;

    window.pupitre.onTerminalData((payload) => {
      for (const held of dataListeners.get(payload.id) ?? []) {
        held(payload.data);
      }
    });
  }

  let held = dataListeners.get(id);

  if (!held) {
    held = new Set();
    dataListeners.set(id, held);
  }

  held.add(listener);

  return () => {
    held.delete(listener);

    if (held.size === 0) {
      dataListeners.delete(id);
    }
  };
}

// Outside React: an unmounted xterm loses its screen, so React only moves the element between hosts.
const live = new Map<string, Live>();

function publishScroll(id: string, xterm: XTerm): void {
  const buffer = xterm.buffer.active;

  noteStatus(id, { atBottom: buffer.viewportY >= buffer.baseY });
}

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

function drawWithWebgl(xterm: XTerm): void {
  try {
    const webgl = new WebglAddon();

    webgl.onContextLoss(() => webgl.dispose());
    xterm.loadAddon(webgl);
  } catch {
    // No WebGL context (headless run, refusing driver): xterm keeps its slower DOM renderer.
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
  xterm.loadAddon(new ClipboardAddon(undefined, writeOnlyClipboard));
  xterm.unicode.activeVersion = "11";
  xterm.registerLinkProvider(addressProvider(xterm, openInBrowser));
  xterm.open(host);
  drawWithWebgl(xterm);

  // Only a shell gets completion: Claude, Codex and the dashboard handle their own input.
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

  const detachData = onTerminalData(id, (data) =>
    xterm.write(data, afterWrite)
  );
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

export function onShortcut(id: string, handler: ShortcutHandler | null): void {
  const entry = live.get(id);

  if (entry) {
    entry.onShortcut = handler;
  }
}

/** Measured before the PTY opens: opening at 80×24 then resizing makes full-screen programs draw twice. */
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

// tmux copies over OSC 52 land here; a remote program never reads the local clipboard.
const writeOnlyClipboard = {
  readText: () => "",
  writeText: (_selection: unknown, text: string) =>
    window.pupitre.copyFromTerminal(text),
};

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

/** Read off the buffer, not replayed: full-screen agents move the cursor instead of breaking lines. */
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

/** One size for every session, saved through the settings holder like a preference. */
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
