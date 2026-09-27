import type {
  AgentState,
  Terminal,
  TerminalEnd,
  TerminalKind,
} from "@shared/terminals";
import { TERMINAL_KINDS } from "@shared/terminals";
import { create } from "zustand";
import {
  isProjectTab,
  type ProjectTab,
  tabOfKind,
} from "../components/projects/project-tabs";
import { translate } from "../i18n/translate";
import {
  type Navigation,
  type RememberedTerminal,
  readNavigation,
  writeNavigation,
} from "../lib/memory";
import { destroy } from "../lib/terminals";
import { useServers } from "./servers";
import { useTerminals } from "./terminals";

export const VIEWS = [
  "dashboard",
  "project",
  "project-add",
  "services",
  "activity",
  "shots",
  "files",
  "backups",
  "access",
  "terminals",
  "settings",
  "help",
] as const;

export type View = (typeof VIEWS)[number];

// A half-filled form is no place to return to; "terminals" settles itself on the first snapshot.
const NOT_RESTORED: readonly View[] = ["project-add", "terminals"];

const remembered = readNavigation();

function rememberedTabs(): Record<string, ProjectTab> {
  const tabs: Record<string, ProjectTab> = {};

  for (const [project, tab] of Object.entries(remembered.tabs ?? {})) {
    if (isProjectTab(tab)) {
      tabs[project] = tab;
    }
  }

  return tabs;
}

function rememberedView(): View {
  const read = remembered.view as View | undefined;

  return read && VIEWS.includes(read) && !NOT_RESTORED.includes(read)
    ? read
    : "dashboard";
}

/** An entry of the app's own history, not the window's; it lives for one run. */
export interface Location {
  view: View;
  selection: string | null;
  service: string | null;
}

const HOME: Location = { selection: null, service: null, view: "dashboard" };

function sameLocation(a: Location, b: Location): boolean {
  if (a.view !== b.view) {
    return false;
  }

  if (a.view === "project") {
    return a.selection === b.selection;
  }

  return a.view !== "services" || a.service === b.service;
}

function locationIn(names: readonly string[], location: Location): boolean {
  return (
    location.view !== "project" ||
    (location.selection !== null && names.includes(location.selection))
  );
}

function titleOf(kind: TerminalKind, rank: number): string {
  const t = translate();
  const title = t(`terminals.kind.${kind}`);

  return rank > 1 ? t("terminals.kind.numbered", { rank, title }) : title;
}

export type TerminalRow = "shell" | "agent";

export function rowOf(kind: TerminalKind): TerminalRow {
  return kind === "shell" ? "shell" : "agent";
}

export function groupKey(project: string | null, row: TerminalRow): string {
  const base = project ?? "@server";

  return row === "shell" ? base : `${base}:agents`;
}

export function group(
  terminals: readonly Terminal[],
  project: string | null,
  row: TerminalRow
): Terminal[] {
  return terminals.filter(
    (t) => t.project === project && rowOf(t.kind) === row
  );
}

function groupKeyOf(terminal: Terminal): string {
  return groupKey(terminal.project, rowOf(terminal.kind));
}

// tmux exits 0 however its program left; a broken link is ssh's 255 and the session survives.
const CLEAN_EXIT = 0;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isKind(value: unknown): value is TerminalKind {
  return (
    typeof value === "string" &&
    (TERMINAL_KINDS as readonly string[]).includes(value)
  );
}

function tabOf(entry: RememberedTerminal): Terminal | null {
  const id = text(entry.id);
  const title = text(entry.title);

  if (!(id && title && isKind(entry.kind))) {
    return null;
  }

  return {
    dir: text(entry.dir),
    dormant: true,
    id,
    kind: entry.kind,
    project: text(entry.project),
    session: text(entry.session),
    title,
  };
}

export interface RestoredTerminals {
  terminals: Terminal[];
  activeTabs: Record<string, string>;
  activeTerminal: string | null;
}

/** Unreadable entries are dropped, never repaired: a bad line on disk costs a tab, never the launch. */
export function restoredTerminals(
  memory: Navigation = readNavigation()
): RestoredTerminals {
  const kept = Array.isArray(memory.terminals) ? memory.terminals : [];
  const terminals = kept.flatMap((entry) => tabOf(entry) ?? []);
  const ids = new Set(terminals.map((terminal) => terminal.id));
  const keyOf = new Map(
    terminals.map((terminal) => [terminal.id, groupKeyOf(terminal)])
  );
  const fronts = Object.entries(memory.terminalTabs ?? {});
  const front = text(memory.terminal);

  return {
    activeTabs: Object.fromEntries(
      fronts.filter(
        ([key, id]) => typeof id === "string" && keyOf.get(id) === key
      )
    ),
    activeTerminal: front && ids.has(front) ? front : null,
    terminals,
  };
}

/** A tab the main process already named; the title is the caller's. */
export interface GivenTerminal {
  id: string;
  title: string;
}

interface NavigationStore {
  view: View;
  selection: string | null;
  service: string | null;
  terminals: Terminal[];
  // Keyed by `groupKey`.
  activeTabs: Record<string, string>;
  terminalStates: Record<string, AgentState>;
  activeTerminal: string | null;
  projectTabs: Record<string, ProjectTab>;
  history: Location[];
  cursor: number;

  goTo: (view: View) => void;
  openService: (moduleId: string) => void;
  select: (name: string) => void;
  back: () => void;
  forward: () => void;
  settle: (names: readonly string[]) => void;
  // `dir` is a folder under the project's or the server's root; `given` is a tab the main process already named.
  openTerminal: (
    project: string | null,
    kind: TerminalKind,
    dir?: string | null,
    given?: GivenTerminal | null
  ) => string;
  // A shell falls back to the server; an agent only runs in a project.
  openTerminalHere: (kind?: TerminalKind) => void;
  ensureTerminal: (project: string | null) => void;
  closing: string | null;
  askCloseTerminal: (id: string) => void;
  keepTerminal: () => void;
  // `ended`: the session is already gone, so nothing is killed on the machine.
  closeTerminal: (id: string, ended?: boolean) => void;
  // A clean agent exit closes its tab; a shell or a broken link keeps it as the way back.
  endTerminal: (id: string, code: number) => void;
  activateTerminal: (id: string) => void;
  renameTerminal: (id: string, title: string) => void;
  noteSession: (id: string, session: string) => void;
  noteStates: (states: Record<string, AgentState>) => void;
  setProjectTab: (project: string, tab: ProjectTab) => void;
  reset: () => void;
}

const START: Location = {
  selection: remembered.project ?? null,
  service: null,
  view: rememberedView(),
};

// Browser-like: what was ahead is dropped, and moving where one already stands adds no entry.
function move(
  state: NavigationStore,
  next: Location
): Partial<NavigationStore> {
  const here = state.history[state.cursor];

  if (here && sameLocation(here, next)) {
    return next;
  }

  const history = [...state.history.slice(0, state.cursor + 1), next];

  return { ...next, cursor: history.length - 1, history };
}

export const useNavigation = create<NavigationStore>((set, get) => ({
  ...restoredTerminals(remembered),
  closing: null,
  cursor: 0,
  history: [START],
  projectTabs: rememberedTabs(),
  selection: START.selection,
  service: START.service,
  terminalStates: {},
  view: START.view,

  goTo(view) {
    set((state) =>
      move(state, { selection: state.selection, service: null, view })
    );

    persist(get());
  },

  openService(moduleId) {
    set((state) =>
      move(state, {
        selection: state.selection,
        service: moduleId,
        view: "services",
      })
    );

    persist(get());
  },

  select(name) {
    set((state) =>
      move(state, { selection: name, service: null, view: "project" })
    );

    persist(get());
  },

  back() {
    const { cursor, history } = get();
    const target = history[cursor - 1];

    if (!target) {
      return;
    }

    set({ ...target, cursor: cursor - 1 });
    persist(get());
  },

  forward() {
    const { cursor, history } = get();
    const target = history[cursor + 1];

    if (!target) {
      return;
    }

    set({ ...target, cursor: cursor + 1 });
    persist(get());
  },

  // A project gone from the registry leaves the history too, so "back" never lands on nothing.
  settle(names) {
    const state = get();
    const selection =
      state.selection && names.includes(state.selection)
        ? state.selection
        : (names[0] ?? null);
    const terminals = state.terminals.filter((terminal) =>
      opensStill(names, terminal)
    );
    const kept = state.history.every((location) => locationIn(names, location));

    const dropped = terminals.length !== state.terminals.length;

    if (selection === state.selection && kept && !dropped) {
      return;
    }

    const history: Location[] = [];
    let cursor = 0;

    state.history.forEach((location, index) => {
      if (index === state.cursor) {
        cursor = history.length;
        history.push({ ...location, selection });
      } else if (locationIn(names, location)) {
        history.push(location);
      }
    });

    set({
      cursor,
      history,
      selection,
      ...(dropped ? withTabs(state, terminals) : {}),
    });

    if (dropped) {
      persist(get());
    }
  },

  openTerminal(project, kind, dir = null, given = null) {
    const id =
      given?.id ??
      `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const rank =
      group(get().terminals, project, rowOf(kind)).filter(
        (t) => t.kind === kind
      ).length + 1;
    const title = given?.title ?? titleOf(kind, rank);

    set((state) => ({
      ...(project === null
        ? move(state, {
            selection: state.selection,
            service: null,
            view: "terminals",
          })
        : {}),
      activeTabs: { ...state.activeTabs, [groupKey(project, rowOf(kind))]: id },
      activeTerminal: project === null ? id : state.activeTerminal,
      terminals: [
        ...state.terminals,
        { dir, dormant: false, id, kind, project, session: null, title },
      ],
    }));

    persist(get());

    return id;
  },

  openTerminalHere(kind = "shell") {
    const { view, selection } = get();

    if (view === "project" && selection !== null) {
      get().openTerminal(selection, kind);
      get().setProjectTab(selection, tabOfKind(kind));
    } else if (kind === "shell") {
      get().openTerminal(null, kind);
    }
  },

  // A project's terminals open on a shell right away; agents stay the reader's choice.
  ensureTerminal(project) {
    if (group(get().terminals, project, "shell").length === 0) {
      get().openTerminal(project, "shell");
    }
  },

  askCloseTerminal(id) {
    const leaving = get().terminals.find((t) => t.id === id);

    if (!leaving) {
      return;
    }

    if (closeStopsWork(leaving, get().terminalStates[id])) {
      set({ closing: id });

      return;
    }

    get().closeTerminal(id);
  },

  keepTerminal() {
    set({ closing: null });
  },

  // Closing a tab kills its session; closing the window only lets go of the pipe.
  closeTerminal(id, ended = false) {
    const leaving = get().terminals.find((t) => t.id === id);

    destroy(id, ended ? null : endOf(leaving));
    useTerminals.getState().forget(id);

    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== id);
      const activeTabs = { ...state.activeTabs };

      if (leaving) {
        const key = groupKeyOf(leaving);

        if (activeTabs[key] === id) {
          const neighbour = group(
            remaining,
            leaving.project,
            rowOf(leaving.kind)
          ).at(-1);

          if (neighbour) {
            activeTabs[key] = neighbour.id;
          } else {
            delete activeTabs[key];
          }
        }
      }

      return {
        activeTabs,
        activeTerminal:
          state.activeTerminal === id
            ? (remaining.filter((t) => t.project === null).at(-1)?.id ?? null)
            : state.activeTerminal,
        closing: state.closing === id ? null : state.closing,
        terminals: remaining,
      };
    });

    persist(get());
  },

  endTerminal(id, code) {
    const ended = get().terminals.find((t) => t.id === id);

    if (ended && rowOf(ended.kind) === "agent" && code === CLEAN_EXIT) {
      get().closeTerminal(id, true);
    }
  },

  // Activating is what wakes a dormant tab left by the last run.
  activateTerminal(id) {
    const target = get().terminals.find((t) => t.id === id);

    if (!target) {
      return;
    }

    set((state) => ({
      ...move(state, {
        selection: target.project ?? state.selection,
        service: target.project === null ? null : state.service,
        view: target.project === null ? "terminals" : state.view,
      }),
      activeTabs: {
        ...state.activeTabs,
        [groupKeyOf(target)]: id,
      },
      activeTerminal: target.project === null ? id : state.activeTerminal,
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, dormant: false } : t
      ),
    }));

    persist(get());
  },

  renameTerminal(id, title) {
    const clean = title.trim().slice(0, 40);

    if (!clean) {
      return;
    }

    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, title: clean } : t
      ),
    }));

    persist(get());
  },

  noteSession(id, session) {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, session } : t
      ),
    }));

    persist(get());
  },

  noteStates(states) {
    set({ terminalStates: states });
  },

  setProjectTab(project, tab) {
    set((state) => ({ projectTabs: { ...state.projectTabs, [project]: tab } }));
    persist(get());
  },

  // Another server: let go of the pipes, never destroy the sessions left on the machine.
  reset() {
    for (const terminal of get().terminals) {
      destroy(terminal.id);
    }

    useTerminals.getState().reset();

    set({
      ...HOME,
      activeTabs: {},
      activeTerminal: null,
      closing: null,
      cursor: 0,
      history: [HOME],
      terminals: [],
      terminalStates: {},
    });

    persist(get());
  },
}));

function withTabs(
  state: NavigationStore,
  terminals: Terminal[]
): Partial<NavigationStore> {
  const ids = new Set(terminals.map((terminal) => terminal.id));

  return {
    activeTabs: Object.fromEntries(
      Object.entries(state.activeTabs).filter(([, id]) => ids.has(id))
    ),
    activeTerminal:
      state.activeTerminal && ids.has(state.activeTerminal)
        ? state.activeTerminal
        : null,
    terminals,
  };
}

// A dormant tab of an undeclared project can never reopen; an opened one is the reader's work.
function opensStill(names: readonly string[], terminal: Terminal): boolean {
  return (
    !terminal.dormant ||
    terminal.project === null ||
    names.includes(terminal.project)
  );
}

function endOf(terminal: Terminal | undefined): TerminalEnd | null {
  const serverId = useServers.getState().config?.active ?? null;

  return terminal?.session && serverId
    ? { serverId, session: terminal.session }
    : null;
}

/** An agent's session holds its conversation even at rest; a shell only while it prints. */
export function closeStopsWork(
  terminal: Terminal,
  state: AgentState | undefined
): boolean {
  const ended =
    useTerminals.getState().sessions[terminal.id]?.status === "ended";

  if (!terminal.session || ended || state === "finished") {
    return false;
  }

  return terminal.kind !== "shell" || state === "working";
}

function remember(terminal: Terminal): RememberedTerminal {
  const { dir, id, kind, project, session, title } = terminal;

  return { dir, id, kind, project, session, title };
}

// Called from the actions, not a subscription, which would write on every poll.
function persist(state: NavigationStore): void {
  writeNavigation({
    project: state.selection ?? undefined,
    tabs: state.projectTabs,
    terminal: state.activeTerminal ?? undefined,
    terminals: state.terminals.map(remember),
    terminalTabs: state.activeTabs,
    view: state.view,
  });
}

const RANK: Record<AgentState, number> = {
  asleep: 1,
  attention: 4,
  finished: 0,
  idle: 2,
  working: 3,
};

/** The most pressing state of a group, since the sidebar has room for one dot. */
export function dominantState(
  sessions: readonly Terminal[],
  states: Record<string, AgentState>
): AgentState | null {
  let kept: AgentState | null = null;

  for (const session of sessions) {
    const current = states[session.id];

    if (current && (kept === null || RANK[current] > RANK[kept])) {
      kept = current;
    }
  }

  return kept;
}
