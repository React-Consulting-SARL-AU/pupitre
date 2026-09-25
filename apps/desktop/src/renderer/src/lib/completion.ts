import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import type { Translate } from "@renderer/i18n/i18n";
import { translate } from "@renderer/i18n/translate";
import type { Candidate } from "@shared/completion";
import type { IMarker, Terminal as XTerm } from "@xterm/xterm";
import { useSyncExternalStore } from "react";
import { dropStoredHistory } from "./memory";
import { noteStatus } from "./terminal-status";

export const TERMINAL_FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';

export interface Cursor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompletionState {
  line: string;
  token: string;
  candidates: Candidate[];
  selection: number;
  /** Inline suggestion: the rest of the latest history entry starting like the line. */
  ghost: string;
  cursor: Cursor | null;
  /** Set by Escape; nothing shows until the line changes. */
  closed: boolean;
}

export const NOTHING: CompletionState = {
  line: "",
  token: "",
  candidates: [],
  selection: 0,
  ghost: "",
  cursor: null,
  closed: false,
};

interface Sources {
  catalog: CompletionsResult | null;
  projects: string[];
  processes?: Record<string, readonly string[]>;
  history: string[];
  paths: string[];
}

const PATH_COMMANDS = new Set([
  "cd",
  "ls",
  "cat",
  "less",
  "tail",
  "head",
  "vim",
  "vi",
  "nano",
  "bat",
  "rm",
  "cp",
  "mv",
  "mkdir",
  "source",
  "code",
  "zed",
]);

const LEADING_SLASH = /^\//;
const SEPARATORS = /\s*(?:\|\||&&|\||;)\s*/;
const SPACES = /\s+/;
const TRAILING_SPACE = /\s$/;
const MAXIMUM = 10;

/** Only the segment after the last `&&`, `||`, `|` or `;` is completed. */
export function split(line: string): {
  tokens: string[];
  token: string;
  position: number;
} {
  const segment = line.split(SEPARATORS).at(-1) ?? "";
  const tokens = segment.split(SPACES).filter(Boolean);
  const fresh = segment.length === 0 || TRAILING_SPACE.test(segment);

  return {
    tokens,
    token: fresh ? "" : (tokens.at(-1) ?? ""),
    position: fresh ? tokens.length : tokens.length - 1,
  };
}

type Offer = (candidate: Candidate) => void;

interface Line {
  tokens: string[];
  token: string;
  position: number;
}

function proposeCommands(
  where: Line,
  sources: Sources,
  add: Offer,
  t: Translate
): void {
  const { token } = where;

  if (token.length === 0) {
    return;
  }

  if (sources.catalog?.command.startsWith(token)) {
    add({
      help: t("terminals.completion.agentCommand"),
      kind: "command",
      text: sources.catalog.command,
    });
  }

  for (const entry of sources.history) {
    const first = entry.split(SPACES)[0];

    if (first?.startsWith(token)) {
      add({ kind: "command", text: first });
    }
  }
}

function proposeValues(
  values: readonly string[],
  token: string,
  project: string,
  sources: Sources,
  add: Offer,
  t: Translate
): void {
  for (const value of values) {
    if (value === "$project") {
      for (const name of sources.projects) {
        if (name.startsWith(token)) {
          add({
            help: t("terminals.completion.project"),
            kind: "argument",
            text: name,
          });
        }
      }

      continue;
    }

    if (value === "$process") {
      for (const id of sources.processes?.[project] ?? []) {
        if (id.startsWith(token)) {
          add({
            help: t("terminals.completion.process"),
            kind: "argument",
            text: id,
          });
        }
      }

      continue;
    }

    if (value.startsWith(token)) {
      add({ kind: "argument", text: value });
    }
  }
}

function proposeGrammar(
  where: Line,
  sources: Sources,
  add: Offer,
  t: Translate
): void {
  const grammar = sources.catalog;
  const { tokens, token, position } = where;

  if (!grammar || tokens[0] !== grammar.command) {
    return;
  }

  if (position === 1) {
    for (const sub of grammar.sub) {
      if (sub.name.startsWith(token)) {
        add({ help: sub.help, kind: "argument", text: sub.name });
      }
    }

    return;
  }

  const sub = grammar.sub.find((candidate) => candidate.name === tokens[1]);

  proposeValues(
    sub?.args[position - 2] ?? [],
    token,
    tokens[2] ?? "",
    sources,
    add,
    t
  );
}

function proposePaths(where: Line, sources: Sources, add: Offer): void {
  const { tokens, token, position } = where;
  const command = tokens[0] ?? "";
  const wanted = token.includes("/") || PATH_COMMANDS.has(command);

  if (position === 0 || !wanted) {
    return;
  }

  for (const path of sources.paths) {
    if (path.startsWith(token)) {
      add({ kind: "path", text: path });
    }
  }
}

function proposeHistory(line: string, sources: Sources, add: Offer): string {
  let ghost = "";

  for (const entry of sources.history) {
    if (entry.startsWith(line) && entry.length > line.length) {
      if (ghost.length === 0) {
        ghost = entry.slice(line.length);
      }

      add({ kind: "history", text: entry });
    }
  }

  return ghost;
}

export function propose(
  line: string,
  sources: Sources,
  t: Translate
): { candidates: Candidate[]; ghost: string } {
  // A list at every empty prompt would steal the arrow keys from the shell's history.
  if (line.trim().length === 0) {
    return { candidates: [], ghost: "" };
  }

  const where = split(line);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  const add: Offer = (candidate) => {
    const key = `${candidate.kind}:${candidate.text}`;

    if (
      candidate.text !== where.token &&
      !seen.has(key) &&
      candidates.length < MAXIMUM
    ) {
      seen.add(key);
      candidates.push(candidate);
    }
  };

  if (where.position === 0) {
    proposeCommands(where, sources, add, t);
  } else {
    proposeGrammar(where, sources, add, t);
  }

  proposePaths(where, sources, add);

  const ghost = proposeHistory(line, sources, add);

  return { candidates, ghost };
}

export function insertion(
  candidate: Candidate,
  line: string,
  token: string
): string {
  if (candidate.kind === "history") {
    return candidate.text.slice(line.length);
  }

  const rest = candidate.text.slice(token.length).replaceAll(" ", "\\ ");
  const isDir = candidate.kind === "path" && candidate.text.endsWith("/");

  return isDir ? rest : `${rest} `;
}

function pathBase(
  token: string,
  position: number,
  command: string
): string | null {
  if (position === 0 || !(token.includes("/") || PATH_COMMANDS.has(command))) {
    return null;
  }

  const cut = token.lastIndexOf("/");

  return cut === -1 ? "" : token.slice(0, cut + 1);
}

/** The agent's `completions` only reads under the projects root. */
export function underRoot(
  root: string,
  dir: string,
  base: string
): string | null {
  if (root.length === 0 || dir.length === 0) {
    return null;
  }

  const absolute = base.startsWith("/") ? base : `${dir}/${base}`;
  const walked: string[] = [];

  for (const part of absolute.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      walked.pop();
      continue;
    }

    walked.push(part);
  }

  const path = `/${walked.join("/")}`;
  const inside = path === root || path.startsWith(`${root}/`);

  return inside ? path.slice(root.length).replace(LEADING_SLASH, "") : null;
}

interface Tracked {
  xterm: XTerm;
  marker: IMarker | null;
  column: number;
  typing: boolean;
  dir: string;
  state: CompletionState;
  closedFor: string | null;
  paths: Map<string, string[]>;
  timer: ReturnType<typeof setTimeout> | null;
}

const tracked = new Map<string, Tracked>();
const subscribers = new Map<string, Set<() => void>>();

let catalog: CompletionsResult | null = null;
let catalogRequest: Promise<unknown> | null = null;
let serverId: string | null = null;
let history: string[] = [];
let projects: string[] = [];
let processes: Record<string, readonly string[]> = {};

// Memory only: a typed line can carry a token, so history never touches disk.
const histories = new Map<string, string[]>();

const HISTORY_KEPT = 200;

function loadCatalog(): void {
  if (catalogRequest || !serverId) {
    return;
  }

  const asked = serverId;
  const request = window.pupitre.completions(asked).then(
    (answer) => {
      if (serverId !== asked) {
        return;
      }

      if (answer.ok) {
        catalog = answer.result;
      } else if (catalogRequest === request) {
        catalogRequest = null;
      }
    },
    () => {
      if (catalogRequest === request) {
        catalogRequest = null;
      }
    }
  );

  catalogRequest = request;
}

function rememberCommand(line: string): void {
  const command = line.trim();

  if (command.length === 0 || !serverId || history[0] === command) {
    return;
  }

  history = [command, ...history.filter((e) => e !== command)].slice(
    0,
    HISTORY_KEPT
  );
  histories.set(serverId, history);
}

export function noteProjects(
  declared: readonly { name: string; processes: readonly { id: string }[] }[]
): void {
  projects = declared.map((project) => project.name);
  processes = Object.fromEntries(
    declared.map((project) => [
      project.name,
      project.processes.map((process) => process.id),
    ])
  );
}

export function noteServer(id: string | null): void {
  if (id !== serverId) {
    serverId = id;
    forgetSources();
    dropStoredHistory();
    history = id ? (histories.get(id) ?? []) : [];
  }
}

export function forgetSources(): void {
  catalog = null;
  catalogRequest = null;
  history = [];
  projects = [];
  processes = {};

  for (const item of tracked.values()) {
    item.paths.clear();
  }
}

function publish(id: string, item: Tracked, state: CompletionState): void {
  const before = item.state;
  const same =
    before.line === state.line &&
    before.ghost === state.ghost &&
    before.selection === state.selection &&
    before.closed === state.closed &&
    before.candidates === state.candidates &&
    before.cursor?.x === state.cursor?.x &&
    before.cursor?.y === state.cursor?.y;

  if (same) {
    return;
  }

  item.state = state;

  for (const callback of subscribers.get(id) ?? []) {
    callback();
  }
}

// Reads the screen from the OSC 133;B mark, not the keys, so deletions and history recalls count.
function readLine(item: Tracked): string | null {
  const { xterm, marker } = item;

  if (!marker || marker.isDisposed) {
    return null;
  }

  const buffer = xterm.buffer.active;
  const start = marker.line;
  const end = buffer.baseY + buffer.cursorY;

  if (end < start) {
    return null;
  }

  let text = "";

  for (let y = start; y <= end; y++) {
    const row = buffer.getLine(y);

    if (!row) {
      return null;
    }

    const from = y === start ? item.column : 0;
    const to = y === end ? buffer.cursorX : row.length;
    text += row.translateToString(false, from, to);
  }

  return text;
}

function atEndOfLine(xterm: XTerm): boolean {
  const buffer = xterm.buffer.active;
  const row = buffer.getLine(buffer.baseY + buffer.cursorY);
  const next = buffer.getLine(buffer.baseY + buffer.cursorY + 1);

  return (
    (row?.translateToString(true, buffer.cursorX).trim().length ?? 0) === 0 &&
    !next?.isWrapped
  );
}

// xterm parks its hidden input textarea on the cursor cell so input methods can attach to it.
function cursorPosition(xterm: XTerm): Cursor | null {
  const area = xterm.textarea;
  const frame = xterm.element;

  if (!(area && frame)) {
    return null;
  }

  const r = area.getBoundingClientRect();
  const f = frame.getBoundingClientRect();

  if (f.width === 0 || f.height === 0) {
    return null;
  }

  return {
    x: r.left,
    y: r.top,
    width: r.width || f.width / xterm.cols,
    height: r.height || f.height / xterm.rows,
  };
}

function requestPaths(id: string, item: Tracked, asked: string): void {
  if (item.paths.has(asked) || !serverId) {
    return;
  }

  if (item.timer) {
    clearTimeout(item.timer);
  }

  item.timer = setTimeout(async () => {
    item.timer = null;

    const answer = await window.pupitre.completions(serverId as string, asked);

    item.paths.set(asked, answer.ok ? answer.result.paths : []);
    recompute(id);
  }, 120);
}

export function recompute(id: string): void {
  const item = tracked.get(id);

  if (!item) {
    return;
  }

  const { xterm } = item;

  if (!item.typing || xterm.buffer.active.type !== "normal") {
    publish(id, item, NOTHING);
    return;
  }

  const line = readLine(item);

  if (line === null) {
    publish(id, item, NOTHING);
    return;
  }

  const { tokens, token, position } = split(line);
  const base = pathBase(token, position, tokens[0] ?? "");
  const asked =
    base === null || !catalog ? null : underRoot(catalog.root, item.dir, base);
  let paths: string[] = [];

  if (asked !== null && base !== null) {
    paths = (item.paths.get(asked) ?? []).map((entry) => base + entry);
    requestPaths(id, item, asked);
  }

  const { candidates, ghost } = propose(
    line,
    {
      catalog,
      projects: projects.length > 0 ? projects : (catalog?.projects ?? []),
      processes,
      history,
      paths,
    },
    translate()
  );

  const sameLine = line === item.state.line;
  const selection = sameLine
    ? Math.min(item.state.selection, Math.max(0, candidates.length - 1))
    : 0;

  publish(id, item, {
    line,
    token,
    candidates:
      sameLine && identical(candidates, item.state.candidates)
        ? item.state.candidates
        : candidates,
    selection,
    ghost: atEndOfLine(xterm) ? ghost : "",
    cursor: cursorPosition(xterm),
    closed: item.closedFor === line,
  });
}

function identical(a: Candidate[], b: Candidate[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.text === b[i].text && c.kind === b[i].kind)
  );
}

function sendToTerminal(id: string, text: string): void {
  if (text.length > 0) {
    window.pupitre.writeTerminal(id, text);
  }
}

export function accept(id: string, candidate: Candidate): void {
  const item = tracked.get(id);

  if (!item) {
    return;
  }

  sendToTerminal(id, insertion(candidate, item.state.line, item.state.token));
  item.xterm.focus();
}

function navigate(id: string, item: Tracked, step: number): void {
  const { state } = item;
  const total = state.candidates.length;

  if (total === 0) {
    return;
  }

  publish(id, item, {
    ...state,
    selection: (state.selection + step + total) % total,
  });
}

function dismiss(id: string, item: Tracked): void {
  item.closedFor = item.state.line;
  publish(id, item, { ...item.state, closed: true });
}

// Keys are only taken while something shows; otherwise Tab and the arrows stay the shell's.
function handleKey(id: string, item: Tracked, ev: KeyboardEvent): boolean {
  if (ev.type !== "keydown") {
    return true;
  }

  const { state } = item;
  const list = !state.closed && state.candidates.length > 0;
  const ghost = !state.closed && state.ghost.length > 0;

  switch (ev.key) {
    case "Tab":
      if (ev.shiftKey) {
        return true;
      }
      if (list) {
        accept(id, state.candidates[state.selection]);
        return false;
      }
      if (ghost) {
        sendToTerminal(id, state.ghost);
        return false;
      }
      return true;
    case "ArrowDown":
      if (list) {
        navigate(id, item, 1);
        return false;
      }
      return true;
    case "ArrowUp":
      if (list) {
        navigate(id, item, -1);
        return false;
      }
      return true;
    case "ArrowRight":
      if (ghost && !(ev.altKey || ev.metaKey || ev.ctrlKey)) {
        sendToTerminal(id, state.ghost);
        return false;
      }
      return true;
    case "Escape":
      if (list || ghost) {
        dismiss(id, item);
        return false;
      }
      return true;
    case "Enter":
      if (list || ghost) {
        dismiss(id, item);
      }
      return true;
    default:
      return true;
  }
}

/** Needs OSC 133 and OSC 7 from the `.zshrc` block the agent writes; a prompt is never guessed from its drawing. */
export function attach(id: string, xterm: XTerm): () => void {
  const item: Tracked = {
    xterm,
    marker: null,
    column: 0,
    typing: false,
    dir: "",
    state: NOTHING,
    closedFor: null,
    paths: new Map(),
    timer: null,
  };

  tracked.set(id, item);
  loadCatalog();

  const osc133 = xterm.parser.registerOscHandler(133, (data) => {
    const code = data.split(";")[0];

    if (code === "B") {
      item.marker?.dispose();
      item.marker = xterm.registerMarker(0) ?? null;
      item.column = xterm.buffer.active.cursorX;
      item.typing = true;
      item.closedFor = null;
    } else if (code === "C") {
      rememberCommand(readLine(item) ?? "");
      item.typing = false;
      publish(id, item, NOTHING);
    } else if (code === "D") {
      item.typing = false;
    }

    return true;
  });

  const osc7 = xterm.parser.registerOscHandler(7, (data) => {
    try {
      item.dir = decodeURIComponent(new URL(data).pathname);
      noteStatus(id, { dir: item.dir });
    } catch {
      // Malformed URL: keep the previous folder.
    }

    return true;
  });

  const scroll = xterm.onScroll(() => recompute(id));

  return () => {
    osc133.dispose();
    osc7.dispose();
    scroll.dispose();
    item.marker?.dispose();

    if (item.timer) {
      clearTimeout(item.timer);
    }

    tracked.delete(id);
  };
}

function subscribe(id: string, callback: () => void): () => void {
  let list = subscribers.get(id);

  if (!list) {
    list = new Set();
    subscribers.set(id, list);
  }

  list.add(callback);

  return () => {
    list.delete(callback);

    if (list.size === 0) {
      subscribers.delete(id);
    }
  };
}

export function useCompletion(id: string): CompletionState {
  return useSyncExternalStore(
    (callback) => subscribe(id, callback),
    () => tracked.get(id)?.state ?? NOTHING
  );
}

export function completionKey(id: string, event: KeyboardEvent): boolean {
  const item = tracked.get(id);

  return item ? handleKey(id, item, event) : true;
}
