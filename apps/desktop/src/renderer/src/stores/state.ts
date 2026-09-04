import type {
  ActionResult,
  AgentState,
  Capabilities,
  ConnectionState,
  GitStatus,
  Machine,
  ProcessInfo,
  Project,
  ServersConfig,
  Session,
  Snapshot,
  Terminal,
  TerminalKind,
} from "@shared/contract";
import { create } from "zustand";
import { forgetSources } from "../lib/completion";
import { readNavigation, writeNavigation } from "../lib/memory";
import { destroy } from "../lib/terminals";

export type View =
  | "dashboard"
  | "project"
  | "terminals"
  | "secrets"
  | "settings";

const VIEWS: View[] = [
  "dashboard",
  "project",
  "terminals",
  "secrets",
  "settings",
];

/**
 * What the last session left open.
 *
 * Read once, at module load: the app opens on the view and the project you were
 * on, and each project reopens on the tab you left it on. Coming back to a
 * project you were driving from its Claude tab and landing on the overview means
 * finding the session again by hand — every single time.
 */
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
  shell: "Shell",
  claude: "Claude",
  codex: "Codex",
  tui: "Dashboard",
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
  terminals: Terminal[],
  project: string | null,
  kind: TerminalKind
): Terminal[] {
  return terminals.filter((t) => t.project === project && t.kind === kind);
}

type State = {
  snapshot: Snapshot | null;
  /** What the active server can do. Null until we have asked it. */
  capabilities: Capabilities | null;
  processes: ProcessInfo[];
  sessions: Session[];
  servers: ServersConfig | null;
  previous: Machine | null;
  cpuPercent: number | null;
  connection: ConnectionState | null;
  view: View;
  selection: string | null;
  terminals: Terminal[];
  /** The active tab of each group, by group key. */
  activeTabs: Record<string, string>;
  /** What each session is doing, held by the main process. */
  terminalStates: Record<string, AgentState>;
  activeTerminal: string | null;
  message: string | null;
  busy: string | null;
  /** The gap with the remote repository, per project. */
  git: Record<string, GitStatus>;
  /** True while the repositories are being queried: it goes over the network. */
  gitBusy: boolean;
  /** When the repositories were really queried, in milliseconds. */
  gitCheckedAt: number | null;
  /** The tab each project was left on, by project name. */
  projectTabs: Record<string, string>;

  refresh: () => Promise<void>;
  loadCapabilities: () => Promise<void>;
  refreshProcesses: () => Promise<void>;
  stopSession: (pid: number) => Promise<void>;
  stopProcess: (pid: number, what: string) => Promise<void>;
  rebootServer: () => Promise<void>;
  cleanSessions: () => Promise<void>;
  loadServers: () => Promise<void>;
  saveServers: (config: ServersConfig) => Promise<void>;
  checkConnection: () => Promise<void>;
  refreshGit: (fetch: boolean, projects?: string[]) => Promise<void>;
  pull: (project: string) => Promise<ActionResult>;
  pullAll: () => Promise<void>;
  goTo: (view: View) => void;
  select: (name: string) => void;
  act: (action: "up" | "down" | "restart", project: string) => Promise<void>;
  actOnAll: (action: "up" | "down") => Promise<void>;
  openTerminal: (project: string | null, kind: TerminalKind) => string;
  ensureTerminal: (project: string | null, kind: TerminalKind) => void;
  closeTerminal: (id: string) => void;
  activateTerminal: (id: string) => void;
  renameTerminal: (id: string, title: string) => void;
  noteStates: (states: Record<string, AgentState>) => void;
  announce: (text: string | null) => void;
  /** Remembers which tab a project is being read on. */
  setProjectTab: (project: string, tab: string) => void;
};

export const useAppState = create<State>((set, get) => ({
  snapshot: null,
  capabilities: null,
  processes: [],
  sessions: [],
  servers: null,
  previous: null,
  cpuPercent: null,
  connection: null,
  view: rememberedView(),
  selection: remembered.project ?? null,
  terminals: [],
  activeTabs: {},
  terminalStates: {},
  activeTerminal: null,
  message: null,
  busy: null,
  git: {},
  gitBusy: false,
  gitCheckedAt: null,
  projectTabs: remembered.tabs ?? {},

  async refresh() {
    const snapshot = await window.pupitre.snapshot();
    if (!snapshot) {
      return;
    }
    set((state) => {
      // The CPU percentage comes from the delta between two readings: the server
      // returns raw counters so it does not have to sleep for a second.
      let cpuPercent = state.cpuPercent;
      const before = state.previous;
      if (before) {
        const dTotal = snapshot.machine.cpu_total - before.cpu_total;
        const dIdle = snapshot.machine.cpu_idle - before.cpu_idle;
        if (dTotal > 0) {
          cpuPercent = Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100));
        }
      }
      return {
        snapshot,
        previous: snapshot.machine,
        cpuPercent,
        // A remembered project that no longer exists must not keep the
        // selection pointing at nothing: the page would stay empty with no way
        // to tell why.
        selection:
          (state.selection &&
          snapshot.projects.some((p) => p.name === state.selection)
            ? state.selection
            : null) ??
          snapshot.projects.find((p) => p.state === "online")?.name ??
          snapshot.projects[0]?.name ??
          null,
      };
    });
  },

  async loadCapabilities() {
    set({ capabilities: await window.pupitre.capabilities() });
  },

  async refreshProcesses() {
    const [processes, sessions] = await Promise.all([
      window.pupitre.top(),
      window.pupitre.sessions(),
    ]);
    set({ processes, sessions });
  },

  async stopSession(pid) {
    await window.pupitre.stopSession(pid);
    await get().refreshProcesses();
  },

  async stopProcess(pid, what) {
    if (!window.confirm(`Stop ${what} (pid ${pid})?`)) {
      return;
    }
    const res = await window.pupitre.stopProcess(pid);
    set({ message: res.ok ? null : res.message });
    await get().refreshProcesses();
  },

  async rebootServer() {
    // Two questions rather than one: this gesture cuts off all work in progress,
    // and it has no undo.
    if (!window.confirm("Reboot the server? Every project stops.")) {
      return;
    }
    if (!window.confirm("Confirm: the server comes back in about a minute.")) {
      return;
    }
    await window.pupitre.rebootServer();
    set({
      message: "Rebooting — the server comes back in about a minute.",
      snapshot: null,
      previous: null,
      cpuPercent: null,
      processes: [],
      sessions: [],
      terminals: [],
      activeTabs: {},
      activeTerminal: null,
    });
  },

  async cleanSessions() {
    if (!window.confirm("Stop sessions idle for more than 2 h?")) {
      return;
    }
    await window.pupitre.cleanSessions();
    await get().refreshProcesses();
  },

  async loadServers() {
    set({ servers: await window.pupitre.servers() });
  },

  async saveServers(config) {
    const clean = await window.pupitre.saveServers(config);
    forgetSources();
    // The server may have changed: the terminals pointed at the old one, and the
    // displayed state no longer describes the machine we are driving.
    set({
      servers: clean,
      terminals: [],
      activeTerminal: null,
      snapshot: null,
      capabilities: null,
      previous: null,
      cpuPercent: null,
      selection: null,
      git: {},
      gitCheckedAt: null,
    });
    await get().checkConnection();
  },

  async checkConnection() {
    set({ connection: await window.pupitre.diagnose() });
  },

  /**
   * The state of the repositories, and on demand what the remote has more of.
   *
   * Without `fetch`, this is a read local to the server: instant, but it only
   * sees what has already been brought back. With it, every repository queries
   * its remote — a few seconds, hence the busy indicator.
   */
  async refreshGit(fetch, projects) {
    if (get().gitBusy) {
      return;
    }
    set({ gitBusy: true });
    try {
      const statuses = await window.pupitre.gitStatus(projects ?? null, fetch);
      set((state) => ({
        git: statuses.reduce(
          (all, status) => {
            all[status.project] = status;
            return all;
          },
          { ...state.git }
        ),
        gitCheckedAt: fetch ? Date.now() : state.gitCheckedAt,
      }));
    } finally {
      set({ gitBusy: false });
    }
  },

  /**
   * Everything that can be advanced without deciding anything.
   *
   * Folders carrying uncommitted changes are left alone: advancing them by fiat
   * is the only gesture from here that could lose someone's work.
   */
  async pullAll() {
    // A repository shared by two projects is only pulled once: the second
    // fast-forward would have nothing left to advance.
    const byRoot = new Map<string, GitStatus>();
    for (const status of Object.values(get().git)) {
      if (status.repo && status.behind > 0 && !status.dirty) {
        byRoot.set(status.root, status);
      }
    }
    const failures: string[] = [];
    for (const status of byRoot.values()) {
      const result = await get().pull(status.project);
      if (!result.ok) {
        failures.push(status.project);
      }
    }
    set({
      message:
        failures.length > 0 ? `pull refused: ${failures.join(", ")}` : null,
    });
  },

  async pull(project) {
    const root = get().git[project]?.root;
    // The repository has just moved, and it may carry several projects: re-read
    // them all, otherwise the neighbour would still show as behind on a
    // repository we have just advanced.
    const siblings = root
      ? Object.values(get().git)
          .filter((s) => s.root === root)
          .map((s) => s.project)
      : [project];

    set({ busy: project });
    const result = await window.pupitre.gitPull(project);
    set({ busy: null, message: result.ok ? null : result.message });
    await get().refreshGit(false, siblings);

    return result;
  },

  goTo(view) {
    set({ view });
    persist(get());
  },

  select(name) {
    set({ selection: name, view: "project" });
    persist(get());
  },

  async act(action, project) {
    set({ busy: project, message: null });
    const result = await window.pupitre.action(action, project);
    set({ busy: null, message: result.ok ? null : result.message });
    await get().refresh();
  },

  async actOnAll(action) {
    // These two touch every project at once: an absent-minded click would stop
    // the working day. The confirmation costs one keystroke.
    const verb = action === "up" ? "start" : "stop";
    if (!window.confirm(`${verb} ALL projects?`)) {
      return;
    }
    set({ busy: "all", message: null });
    const result = await window.pupitre.action(action, "all");
    set({ busy: null, message: result.ok ? null : result.message });
    await get().refresh();
  },

  openTerminal(project, kind) {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const dir =
      get().snapshot?.projects.find((p) => p.name === project)?.dir ?? null;
    const rank = group(get().terminals, project, kind).length + 1;
    const title = rank > 1 ? `${LABELS[kind]} ${rank}` : LABELS[kind];

    set((state) => ({
      terminals: [...state.terminals, { id, kind, title, project, dir }],
      activeTabs: { ...state.activeTabs, [groupKey(project, kind)]: id },
      activeTerminal: project === null ? id : state.activeTerminal,
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
        terminals: remaining,
        activeTabs,
        activeTerminal:
          state.activeTerminal === id
            ? (remaining.filter((t) => t.project === null).at(-1)?.id ?? null)
            : state.activeTerminal,
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
      view: target.project === null ? "terminals" : state.view,
      selection: target.project ?? state.selection,
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

  announce(text) {
    set({ message: text });
  },

  setProjectTab(project, tab) {
    set((state) => ({ projectTabs: { ...state.projectTabs, [project]: tab } }));
    persist(get());
  },
}));

/**
 * Writes the navigation down, after the fact.
 *
 * Called from the actions rather than from a subscription: only three things are
 * worth remembering, and a subscription would write on every poll — twice a
 * second, for a value that did not move.
 */
function persist(state: State): void {
  writeNavigation({
    view: state.view,
    project: state.selection ?? undefined,
    tabs: state.projectTabs,
  });
}

const RANK: Record<AgentState, number> = {
  attention: 4,
  working: 3,
  idle: 2,
  asleep: 1,
  finished: 0,
};

/**
 * The most telling state of a group of sessions.
 *
 * One dot per tab does not fit in a sidebar: we keep the most pressing state,
 * the one that would justify going and looking.
 */
export function dominantState(
  sessions: Terminal[],
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

export function selectedProject(
  snapshot: Snapshot | null,
  selection: string | null
): Project | null {
  if (!(snapshot && selection)) {
    return null;
  }
  return snapshot.projects.find((p) => p.name === selection) ?? null;
}
