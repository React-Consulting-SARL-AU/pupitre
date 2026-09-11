import type {
  AgentState,
  Terminal,
  TerminalEnd,
  TerminalKind,
} from "@shared/terminals";
import { TERMINAL_KINDS } from "@shared/terminals";
import { create } from "zustand";
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

/**
 * Where the reader is in the app, and what they left open.
 *
 * Nothing here comes from the server: a view, a selected project, a set of
 * terminal tabs. The state of the machine lives in the snapshot store, and this
 * one only says which part of it is on screen.
 */

export const VIEWS = [
  "dashboard",
  "project",
  "project-add",
  "services",
  "activity",
  "shots",
  "files",
  "terminals",
  "settings",
] as const;

export type View = (typeof VIEWS)[number];

const NOT_RESTORED: readonly View[] = ["project-add", "terminals"];

const remembered = readNavigation();

function rememberedView(): View {
  const read = remembered.view as View | undefined;

  // "project" is only restorable once we know which project, and the terminals
  // view only once one is open: both settle themselves on the first snapshot.
  // A form left half-way is not a place to come back to.
  return read && VIEWS.includes(read) && !NOT_RESTORED.includes(read)
    ? read
    : "dashboard";
}

/**
 * One place the reader has been: a view, and the project when the view is one.
 *
 * The history is the app's own, not the window's: the window never navigates,
 * and what "back" must undo is a change of view. It lives for one run, so a
 * relaunch opens on the last view with nothing behind it.
 */
export interface Location {
  view: View;
  selection: string | null;
}

const HOME: Location = { selection: null, view: "dashboard" };

function sameLocation(a: Location, b: Location): boolean {
  return (
    a.view === b.view && (a.view !== "project" || a.selection === b.selection)
  );
}

function locationIn(names: readonly string[], location: Location): boolean {
  return (
    location.view !== "project" ||
    (location.selection !== null && names.includes(location.selection))
  );
}

/** The name a tab opens with, in the reader's language; the reader may rename it. */
function titleOf(kind: TerminalKind, rank: number): string {
  const t = translate();
  const title = t(`terminals.kind.${kind}`);

  return rank > 1 ? t("terminals.kind.numbered", { rank, title }) : title;
}

/**
 * Terminals are grouped by project AND by kind.
 *
 * That is what lets a project's Claude tab have its own sessions, knowing
 * nothing of those in the Terminal tab nor of those of another project. The
 * server's own terminals have no project.
 */
export function groupKey(project: string | null, kind: TerminalKind): string {
  return `${project ?? "@server"}:${kind}`;
}

export function group(
  terminals: readonly Terminal[],
  project: string | null,
  kind: TerminalKind
): Terminal[] {
  return terminals.filter((t) => t.project === project && t.kind === kind);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isKind(value: unknown): value is TerminalKind {
  return (
    typeof value === "string" &&
    (TERMINAL_KINDS as readonly string[]).includes(value)
  );
}

/** A tab is read back whole or not at all: half a tab opens on nothing. */
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

/**
 * The tabs the last run left, closed and ready to be opened again.
 *
 * Anything the memory cannot make a tab of is dropped rather than repaired, and
 * a tab in front that is no longer there leaves its group with none: a bad line
 * on the disk costs a tab, never the launch.
 */
export function restoredTerminals(
  memory: Navigation = readNavigation()
): RestoredTerminals {
  const kept = Array.isArray(memory.terminals) ? memory.terminals : [];
  const terminals = kept.flatMap((entry) => tabOf(entry) ?? []);
  const ids = new Set(terminals.map((terminal) => terminal.id));
  const fronts = Object.entries(memory.terminalTabs ?? {});
  const front = text(memory.terminal);

  return {
    activeTabs: Object.fromEntries(
      fronts.filter(([, id]) => typeof id === "string" && ids.has(id))
    ),
    activeTerminal: front && ids.has(front) ? front : null,
    terminals,
  };
}

/** A tab named elsewhere: its identifier is the main process's, its title the caller's. */
export interface GivenTerminal {
  id: string;
  title: string;
}

interface NavigationStore {
  view: View;
  selection: string | null;
  /**
   * The service the dashboard sent the reader to: a landing, not a memory.
   * The next move to any view opens the services page on its list again.
   */
  serviceFocus: string | null;
  terminals: Terminal[];
  /** The active tab of each group, by group key. */
  activeTabs: Record<string, string>;
  /** What each session is doing, held by the main process. */
  terminalStates: Record<string, AgentState>;
  activeTerminal: string | null;
  /** The tab each project was left on, by project name. */
  projectTabs: Record<string, string>;
  /** Where the reader has been this run, oldest first. */
  history: Location[];
  /** The entry of `history` on screen. */
  cursor: number;

  goTo: (view: View) => void;
  /** The services page, opened on one service's own page. */
  openService: (moduleId: string) => void;
  select: (name: string) => void;
  back: () => void;
  forward: () => void;
  /** A project that has left the registry must not keep the selection. */
  settle: (names: readonly string[]) => void;
  /**
   * `dir` is a folder under the project's — or under the server's root — the
   * shell opens in. `given` is a tab the main process already named, with the
   * title the screen that asked for it wants: the shell of a database.
   */
  openTerminal: (
    project: string | null,
    kind: TerminalKind,
    dir?: string | null,
    given?: GivenTerminal | null
  ) => string;
  ensureTerminal: (project: string | null, kind: TerminalKind) => void;
  closeTerminal: (id: string) => void;
  activateTerminal: (id: string) => void;
  renameTerminal: (id: string, title: string) => void;
  /** The session the main process named for a tab, so the next run finds it. */
  noteSession: (id: string, session: string) => void;
  noteStates: (states: Record<string, AgentState>) => void;
  setProjectTab: (project: string, tab: string) => void;
  reset: () => void;
}

const START: Location = {
  selection: remembered.project ?? null,
  view: rememberedView(),
};

/**
 * Leaves for a location, as a browser would: what was ahead is forgotten.
 *
 * Arriving where one already stands writes nothing, so a menu entry pressed
 * twice is one page and not two, and "back" is never a step that changes
 * nothing.
 */
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
  cursor: 0,
  history: [START],
  projectTabs: remembered.tabs ?? {},
  selection: START.selection,
  serviceFocus: null,
  terminalStates: {},
  view: START.view,

  goTo(view) {
    set((state) => ({
      ...move(state, { selection: state.selection, view }),
      serviceFocus: null,
    }));
    persist(get());
  },

  openService(moduleId) {
    set((state) => ({
      ...move(state, { selection: state.selection, view: "services" }),
      serviceFocus: moduleId,
    }));
    persist(get());
  },

  select(name) {
    set((state) => ({
      ...move(state, { selection: name, view: "project" }),
      serviceFocus: null,
    }));
    persist(get());
  },

  back() {
    const { cursor, history } = get();
    const target = history[cursor - 1];

    if (!target) {
      return;
    }

    set({ ...target, cursor: cursor - 1, serviceFocus: null });
    persist(get());
  },

  forward() {
    const { cursor, history } = get();
    const target = history[cursor + 1];

    if (!target) {
      return;
    }

    set({ ...target, cursor: cursor + 1, serviceFocus: null });
    persist(get());
  },

  // A project that has left the registry leaves the history too: a "back"
  // that lands on a page with nothing to draw is a "back" that does nothing.
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
        history.push({ selection, view: location.view });
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
    const rank = group(get().terminals, project, kind).length + 1;
    const title = given?.title ?? titleOf(kind, rank);

    set((state) => ({
      ...(project === null
        ? move(state, { selection: state.selection, view: "terminals" })
        : {}),
      activeTabs: { ...state.activeTabs, [groupKey(project, kind)]: id },
      activeTerminal: project === null ? id : state.activeTerminal,
      terminals: [
        ...state.terminals,
        { dir, dormant: false, id, kind, project, session: null, title },
      ],
    }));
    persist(get());

    return id;
  },

  // Opening a project's Claude tab must give a session right away: nobody comes
  // there to click "new" a second time.
  ensureTerminal(project, kind) {
    if (group(get().terminals, project, kind).length === 0) {
      get().openTerminal(project, kind);
    }
  },

  // Closing a tab is the reader saying they are done with that session: the
  // session dies with it, where closing the window only lets go of the pipe.
  closeTerminal(id) {
    const leaving = get().terminals.find((t) => t.id === id);

    destroy(id, endOf(leaving));
    useTerminals.getState().forget(id);

    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== id);
      const activeTabs = { ...state.activeTabs };

      if (leaving) {
        const key = groupKey(leaving.project, leaving.kind);

        if (activeTabs[key] === id) {
          const neighbour = group(remaining, leaving.project, leaving.kind).at(
            -1
          );

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
        terminals: remaining,
      };
    });
    persist(get());
  },

  // Coming back to a remembered tab is what opens it: this is where a tab left
  // by the last run stops being a name and becomes a session again.
  activateTerminal(id) {
    const target = get().terminals.find((t) => t.id === id);

    if (!target) {
      return;
    }

    set((state) => ({
      ...move(state, {
        selection: target.project ?? state.selection,
        view: target.project === null ? "terminals" : state.view,
      }),
      activeTabs: {
        ...state.activeTabs,
        [groupKey(target.project, target.kind)]: id,
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

  /**
   * Another server: its terminals were talking to a machine we have left.
   *
   * The pipes are let go of, not the sessions: nothing of the reader's is
   * destroyed on a machine because the list of servers moved.
   */
  reset() {
    for (const terminal of get().terminals) {
      destroy(terminal.id);
    }

    useTerminals.getState().reset();

    set({
      ...HOME,
      activeTabs: {},
      activeTerminal: null,
      cursor: 0,
      history: [HOME],
      terminals: [],
      terminalStates: {},
    });
    persist(get());
  },
}));

/** A tab that is gone takes with it the place it held in front of its group. */
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

/**
 * A remembered tab on a project the registry no longer declares can never open
 * again. One the reader has opened stays: it is their work, not a leftover.
 */
function opensStill(names: readonly string[], terminal: Terminal): boolean {
  return (
    !terminal.dormant ||
    terminal.project === null ||
    names.includes(terminal.project)
  );
}

/** What the main process needs to end a session: which machine, and which name. */
function endOf(terminal: Terminal | undefined): TerminalEnd | null {
  const serverId = useServers.getState().config?.active ?? null;

  return terminal?.session && serverId
    ? { serverId, session: terminal.session }
    : null;
}

function remember(terminal: Terminal): RememberedTerminal {
  const { dir, id, kind, project, session, title } = terminal;

  return { dir, id, kind, project, session, title };
}

/**
 * Writes the navigation down, after the fact.
 *
 * Called from the actions rather than from a subscription: only the place and
 * the open tabs are worth remembering, and a subscription would write on every
 * poll — twice a second, for a value that did not move.
 */
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

/**
 * The most telling state of a group of sessions.
 *
 * One dot per tab does not fit in a sidebar: we keep the most pressing state,
 * the one that would justify going and looking.
 */
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
