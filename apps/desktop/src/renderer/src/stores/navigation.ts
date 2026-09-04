import type { AgentState, Terminal, TerminalKind } from "@shared/terminals";
import { create } from "zustand";
import { readNavigation, writeNavigation } from "../lib/memory";
import { destroy } from "../lib/terminals";
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
  "services",
  "activity",
  "secrets",
  "terminals",
  "settings",
] as const;

export type View = (typeof VIEWS)[number];

const remembered = readNavigation();

function rememberedView(): View {
  const read = remembered.view as View | undefined;

  // "project" is only restorable once we know which project, and the terminals
  // view only once one is open: both settle themselves on the first snapshot.
  return read && VIEWS.includes(read) && read !== "terminals"
    ? read
    : "dashboard";
}

const LABELS: Record<TerminalKind, string> = {
  claude: "Claude",
  codex: "Codex",
  hermes: "Hermes",
  shell: "Terminal",
};

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

interface NavigationStore {
  view: View;
  selection: string | null;
  terminals: Terminal[];
  /** The active tab of each group, by group key. */
  activeTabs: Record<string, string>;
  /** What each session is doing, held by the main process. */
  terminalStates: Record<string, AgentState>;
  activeTerminal: string | null;
  /** The tab each project was left on, by project name. */
  projectTabs: Record<string, string>;

  goTo: (view: View) => void;
  select: (name: string) => void;
  /** A project that has left the registry must not keep the selection. */
  settle: (names: readonly string[]) => void;
  openTerminal: (project: string | null, kind: TerminalKind) => string;
  ensureTerminal: (project: string | null, kind: TerminalKind) => void;
  closeTerminal: (id: string) => void;
  activateTerminal: (id: string) => void;
  renameTerminal: (id: string, title: string) => void;
  noteStates: (states: Record<string, AgentState>) => void;
  setProjectTab: (project: string, tab: string) => void;
  reset: () => void;
}

export const useNavigation = create<NavigationStore>((set, get) => ({
  activeTabs: {},
  activeTerminal: null,
  projectTabs: remembered.tabs ?? {},
  selection: remembered.project ?? null,
  terminals: [],
  terminalStates: {},
  view: rememberedView(),

  goTo(view) {
    set({ view });
    persist(get());
  },

  select(name) {
    set({ selection: name, view: "project" });
    persist(get());
  },

  settle(names) {
    const { selection } = get();

    if (selection && names.includes(selection)) {
      return;
    }

    set({ selection: names[0] ?? null });
  },

  openTerminal(project, kind) {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const rank = group(get().terminals, project, kind).length + 1;
    const title = rank > 1 ? `${LABELS[kind]} ${rank}` : LABELS[kind];

    set((state) => ({
      activeTabs: { ...state.activeTabs, [groupKey(project, kind)]: id },
      activeTerminal: project === null ? id : state.activeTerminal,
      terminals: [...state.terminals, { dir: null, id, kind, project, title }],
      view: project === null ? "terminals" : state.view,
    }));

    return id;
  },

  // Opening a project's Claude tab must give a session right away: nobody comes
  // there to click "new" a second time.
  ensureTerminal(project, kind) {
    if (group(get().terminals, project, kind).length === 0) {
      get().openTerminal(project, kind);
    }
  },

  closeTerminal(id) {
    const leaving = get().terminals.find((t) => t.id === id);
    destroy(id);
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
  },

  activateTerminal(id) {
    const target = get().terminals.find((t) => t.id === id);

    if (!target) {
      return;
    }

    set((state) => ({
      activeTabs: {
        ...state.activeTabs,
        [groupKey(target.project, target.kind)]: id,
      },
      activeTerminal: target.project === null ? id : state.activeTerminal,
      selection: target.project ?? state.selection,
      view: target.project === null ? "terminals" : state.view,
    }));
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
  },

  noteStates(states) {
    set({ terminalStates: states });
  },

  setProjectTab(project, tab) {
    set((state) => ({ projectTabs: { ...state.projectTabs, [project]: tab } }));
    persist(get());
  },

  /** Another server: its terminals were talking to a machine we have left. */
  reset() {
    for (const terminal of get().terminals) {
      destroy(terminal.id);
    }

    useTerminals.getState().reset();

    set({
      activeTabs: {},
      activeTerminal: null,
      selection: null,
      terminals: [],
      terminalStates: {},
      view: "dashboard",
    });
  },
}));

/**
 * Writes the navigation down, after the fact.
 *
 * Called from the actions rather than from a subscription: only three things
 * are worth remembering, and a subscription would write on every poll — twice a
 * second, for a value that did not move.
 */
function persist(state: NavigationStore): void {
  writeNavigation({
    project: state.selection ?? undefined,
    tabs: state.projectTabs,
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
