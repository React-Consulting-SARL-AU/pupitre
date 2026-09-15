import type {
  FsListResult,
  FsPathResult,
} from "@pupitre/shared/agent-protocol/files";
import type {
  ProjectAddParams,
  ProjectDetectParams,
  ProjectDetectResult,
  ProjectListResult,
} from "@pupitre/shared/agent-protocol/projects";
import type {
  PackageManager,
  Project,
  ProjectState,
} from "@pupitre/shared/agent-protocol/state";
import { translate } from "@renderer/i18n/translate";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { GithubRepo } from "@shared/github";
import { create } from "zustand";
import { agentCall, agentPoll } from "../lib/agent-call";
import {
  FIRST_PORT,
  folderFromSource,
  freePort,
  nameFromSource,
  portFromRemedy,
} from "../lib/project-draft";
import {
  addedRow,
  type Held,
  heldBy,
  heldSubdomains,
  type PortRow,
  type RowProblem,
} from "../lib/project-ports";
import {
  addedProcess,
  firstProcess,
  followProcesses,
  type ProcessDraft,
  type ProcessProblem,
  processesFromDetection,
  processesFromProject,
  processesReady,
  processProblem,
  processRequests,
  publishedSubdomains,
  rowProblems,
} from "../lib/project-processes";
import { useTunnel } from "./tunnel";

/**
 * A project added to a server, from an address to a journal.
 *
 * The order is the whole of it: declare the project, bring its sources and its
 * dependencies, start it, give it its name on the web when it has one, then
 * read its journal and its address. Nothing here decides anything the agent
 * has not said — the repository is read by the agent before it is declared, a
 * refused port comes back with the free one in its remedy, and that is the
 * port the form then proposes.
 */

const LOG_KEPT = 500;

const TAIL = 200;

const SETTLE_POLL_MS = 2000;

/**
 * How many reads a start is given to leave "starting" — a minute at the pace
 * above. A Grails server takes longer and is not a failure: past that, the
 * screen goes on and its outcome keeps following the state the server reports.
 */
export const SETTLE_READS = 30;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const CLOUDFLARE = "exposure.cloudflare";

export const CADDY = "exposure.caddy";

/**
 * What publishes a project on this server, and what the reader has to do for it.
 *
 * Behind a Cloudflare tunnel the app writes the records itself. Behind Caddy
 * the client points their own DNS at the machine, so the screen carries its
 * address: it is what they have to write.
 */
export interface Exposure {
  provider: "cloudflare" | "caddy";
  host: string;
}

export function exposureOf(
  services: readonly { id: string }[],
  host: string | undefined
): Exposure | null {
  if (services.some((service) => service.id === CLOUDFLARE)) {
    return { host: host ?? "", provider: "cloudflare" };
  }

  if (services.some((service) => service.id === CADDY)) {
    return { host: host ?? "", provider: "caddy" };
  }

  return null;
}

/** The module that puts a git identity and a key on the machine: without it a private clone fails. */
export const GITHUB_TOOL = "tool.github";

/**
 * Where a project comes from, chosen rather than guessed.
 *
 * The three are not three ways of typing the same string: a repository of the
 * connected account carries its branch and says whether it is private, a free
 * address carries neither, and a folder is already on the machine and is never
 * cloned at all.
 */
export const SOURCE_KINDS = ["github", "git", "dir"] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export const PHASES = [
  "add",
  "sources",
  "install",
  "up",
  "publish",
  "logs",
] as const;

export type PhaseId = (typeof PHASES)[number];

export type PhaseStatus = "pending" | "running" | "ok" | "skip" | "fail";

export interface Phase {
  id: PhaseId;
  status: PhaseStatus;
  detail?: string;
}

export interface Draft {
  kind: SourceKind;
  /** A repository address, or a folder relative to the projects root. */
  source: string;
  /** True when the repository the account named is private: cloning it needs the GitHub module. */
  privateRepo: boolean;
  /** Empty means the repository's own default branch. */
  branch: string;
  name: string;
  dir: string;
  /** What runs in the project, the first one being the main one. */
  processes: ProcessDraft[];
}

/** What the reader has taken over, and what still follows the source. */
interface Edited {
  name: boolean;
  /** A port, a command, a process added or taken away: the list is theirs, and a detection no longer replaces it. */
  processes: boolean;
}

export type KnownState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "ready"; serverId: string; projects: readonly Project[] }
  | { status: "failed"; serverId: string; error: AgentError };

/**
 * What the agent read off the source: nothing yet, a clone in flight, what it
 * found, or why it could not look.
 */
export type DetectionState =
  | { status: "idle" }
  /** `branch` is the one the clone asks for; absent, the repository's own. */
  | { status: "reading"; source: string; branch?: string }
  | { status: "read"; source: string; result: ProjectDetectResult }
  | { status: "failed"; source: string; error: AgentError };

/**
 * The repositories of the connected GitHub account, read by the main process.
 *
 * `absent` is not a failure: nobody has connected an account yet, and what the
 * screen owes the reader is the way to the settings, not an error.
 */
export type ReposState =
  | { status: "idle" }
  | { status: "absent" }
  | { status: "loading" }
  | { status: "ready"; repos: readonly GithubRepo[] }
  | { status: "failed"; error: AgentError };

/**
 * One folder of the server, and the folders under it.
 *
 * `path` is in the same space as a project's `dir` — relative to the projects
 * root — and the browser never leaves it: what `fs.list` is given is that path
 * under the folder the agent itself named.
 */
export type FolderState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | { status: "ready"; path: string; folders: readonly string[] }
  | { status: "failed"; path: string; error: AgentError };

export type ProjectAddState =
  | { status: "idle" }
  | { status: "running"; serverId: string; name: string; phase: PhaseId }
  | {
      status: "done";
      serverId: string;
      name: string;
      state: ProjectState;
      url?: string;
    }
  | {
      status: "failed";
      serverId: string;
      name: string;
      phase: PhaseId;
      error: AgentError;
    };

interface ProjectAddStore {
  known: KnownState;
  draft: Draft;
  edited: Edited;
  /** True when the processes came from a project the agent already knows. */
  detected: boolean;
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  exposure: Exposure | null;
  phases: Phase[];
  logs: string[];
  run: ProjectAddState;
  /** The pace of the reads that follow a start, shortened by the tests. */
  settleMs: number;

  prepare: (serverId: string, exposure: Exposure | null) => Promise<void>;
  setKind: (kind: SourceKind) => void;
  setSource: (value: string) => void;
  setName: (value: string) => void;
  setBranch: (value: string) => void;
  setProcessId: (process: number, value: string) => void;
  setProcessDir: (process: number, value: string) => void;
  setProcessPkgmgr: (process: number, value: PackageManager) => void;
  setProcessCmd: (process: number, value: string) => void;
  setProcessInstall: (process: number, value: string) => void;
  setRowLabel: (process: number, row: number, value: string) => void;
  setRowPort: (process: number, row: number, value: number) => void;
  setRowPublish: (process: number, row: number, value: boolean) => void;
  setRowWeb: (process: number, row: number, value: string) => void;
  /** Proposes a name on the web no declared project holds, from the project's name and the row's label. */
  generateRowWeb: (process: number, row: number) => void;
  addRow: (process: number) => void;
  removeRow: (process: number, row: number) => void;
  addProcess: () => void;
  removeProcess: (process: number) => void;
  /** The repositories of the connected account, held by the main process. */
  loadRepos: (refresh?: boolean) => Promise<void>;
  /** A repository of the list: its address, its default branch, and what it costs. */
  pickRepo: (repo: GithubRepo) => void;
  /** Lists a folder of the server, relative to the projects root. */
  browse: (serverId: string, path: string) => Promise<void>;
  makeFolder: (serverId: string, name: string) => Promise<void>;
  pickFolder: (path: string) => void;
  /** Asks the agent what the source asks for, without declaring anything. */
  detect: (serverId: string) => Promise<void>;

  launch: (serverId: string) => Promise<void>;
  retry: (serverId: string) => Promise<void>;
  /** Leaves the screen without losing what was typed: the run and the journal go, the draft stays. */
  park: () => void;
  reset: () => void;

  params: () => ProjectAddParams;
  ready: () => boolean;
  /** Why a process would be refused, before the agent is asked. */
  processProblem: (process: number) => ProcessProblem | null;
  /** Why each row of a process would be refused, before the agent is asked. */
  rowProblems: (process: number) => (RowProblem | null)[];
}

const EMPTY_DRAFT: Draft = {
  branch: "",
  dir: "",
  kind: "github",
  name: "",
  privateRepo: false,
  processes: [firstProcess(FIRST_PORT, true)],
  source: "",
};

const UNTOUCHED: Edited = {
  name: false,
  processes: false,
};

function pending(): Phase[] {
  return PHASES.map((id) => ({ id, status: "pending" }));
}

/** What the other projects hold: a project the draft names again does not compete with its own rows. */
function heldOf(known: KnownState, name: string): Held {
  return known.status === "ready"
    ? heldBy(known.projects, name)
    : { hostnames: [], ports: [] };
}

function atProcess(
  processes: readonly ProcessDraft[],
  index: number,
  change: Partial<ProcessDraft>
): ProcessDraft[] {
  return processes.map((current, at) =>
    at === index ? { ...current, ...change } : current
  );
}

function atRow(
  processes: readonly ProcessDraft[],
  index: number,
  row: number,
  change: Partial<PortRow>
): ProcessDraft[] {
  const current = processes[index];

  if (!current) {
    return [...processes];
  }

  return atProcess(processes, index, {
    rows: current.rows.map((held, at) =>
      at === row ? { ...held, ...change } : held
    ),
  });
}

/**
 * A project the agent already declares at this folder or under this name.
 *
 * Its row is what the server itself knows about those sources — the package
 * manager it runs them with, the command it starts them with. Reusing it beats
 * asking the reader to retype what the machine could tell.
 */
function declaredAt(
  known: KnownState,
  name: string,
  dir: string
): Project | null {
  if (known.status !== "ready") {
    return null;
  }

  return (
    known.projects.find(
      (project) => project.dir === dir || project.name === name
    ) ?? null
  );
}

function detectParams(draft: Draft): ProjectDetectParams {
  const source = draft.source.trim();
  const branch = draft.branch.trim();

  if (draft.kind === "dir") {
    return { dir: draft.dir };
  }

  return { repo: source, ...(branch ? { branch } : {}) };
}

/** Two path pieces joined, either of which may be the root and name nothing. */
function under(path: string, name: string): string {
  return [path, name].filter(Boolean).join("/");
}

export const useProjectAdd = create<ProjectAddStore>((set, get) => {
  let leaveJournal: (() => void) | null = null;
  /** The folder the agent named as its projects root, read once per server. */
  let projectsFolder: string | null = null;

  function append(lines: readonly string[]): void {
    if (lines.length === 0) {
      return;
    }

    set((state) => ({ logs: [...state.logs, ...lines].slice(-LOG_KEPT) }));
  }

  function mark(id: PhaseId, status: PhaseStatus, detail?: string): void {
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === id ? { id, status, ...(detail ? { detail } : {}) } : phase
      ),
    }));
  }

  /**
   * A name proposed by the folded subdomain, not by the raw name.
   *
   * A project name takes a dot and an underscore and a DNS label takes neither,
   * so `my.site` proposes `my-site`: the field opens on a value the agent will
   * accept, instead of one the reader has to repair before the button works.
   */
  function derive(
    draft: Draft,
    edited: Edited,
    exposure: boolean,
    taken: readonly string[]
  ): Draft {
    const name = edited.name ? draft.name : nameFromSource(draft.source);
    const dir =
      draft.kind === "dir" ? folderFromSource(draft.source, name) : name;
    const processes = followProcesses(draft.processes, name, exposure, taken);

    return { ...draft, dir, name, processes };
  }

  function refresh(next: Partial<Draft>, touched: Partial<Edited> = {}): void {
    const { draft, edited, exposure, known } = get();
    const merged = { ...edited, ...touched };
    const wanted = derive(
      { ...draft, ...next },
      merged,
      exposure !== null,
      heldSubdomains(heldOf(known, draft.name).hostnames)
    );
    const already = declaredAt(known, wanted.name, wanted.dir);

    if (!already || merged.processes) {
      set({ draft: wanted, detected: false, edited: merged });

      return;
    }

    set({
      detected: true,
      draft: { ...wanted, processes: processesFromProject(already) },
      edited: merged,
    });
  }

  /**
   * The port the agent refused, given the free one it named.
   *
   * The remedy carries the port to use, not the row it was for: the first row
   * whose port a declared project holds is the one that collided, and the main
   * port of the first process is the fallback when the list gives no better
   * clue.
   */
  function takePort(free: number): void {
    const { draft, known } = get();
    const held = heldOf(known, draft.name).ports;

    for (const [index, current] of draft.processes.entries()) {
      const row = current.rows.findIndex((held_) => held.includes(held_.port));

      if (row >= 0) {
        refresh(
          { processes: atRow(draft.processes, index, row, { port: free }) },
          { processes: true }
        );

        return;
      }
    }

    refresh(
      { processes: atRow(draft.processes, 0, 0, { port: free }) },
      { processes: true }
    );
  }

  function fail(phase: PhaseId, error: AgentError): void {
    const { run, draft } = get();
    const serverId = run.status === "idle" ? "" : run.serverId;

    mark(phase, "fail");
    set({
      run: { error, name: draft.name, phase, serverId, status: "failed" },
    });
  }

  function step<T>(
    id: PhaseId,
    serverId: string,
    call: () => Promise<AgentResponse<T>>,
    detail?: string
  ): Promise<AgentResponse<T>> {
    mark(id, "running", detail);
    set({
      run: { name: get().draft.name, phase: id, serverId, status: "running" },
    });

    return call();
  }

  /**
   * Another source is another repository: what the agent read of the last one
   * is read no more, and the processes go back to one on the same port — unless
   * the reader made the list theirs.
   */
  function forgetDetection(): void {
    const { draft, edited, exposure } = get();

    set({ detection: { status: "idle" } });

    if (edited.processes) {
      return;
    }

    const port = draft.processes[0]?.rows[0]?.port ?? FIRST_PORT;

    refresh({ processes: [firstProcess(port, exposure !== null)] });
  }

  /** The main process: the first one, whose journal the outcome shows. */
  function mainProcess(): string {
    return get().draft.processes[0]?.id ?? "";
  }

  /** The journal of every process, read once, so a project that never started still says why. */
  async function readLogs(serverId: string, name: string): Promise<void> {
    for (const process of get().draft.processes) {
      const answer = await window.pupitre.projectJournal(
        serverId,
        name,
        process.id,
        TAIL,
        false,
        (line) => append([line])
      );

      if (answer.ok) {
        append(answer.result.lines);
      }
    }
  }

  async function follow(serverId: string, name: string): Promise<void> {
    leaveJournal?.();

    const journal = window.pupitre.followProjectJournal(
      serverId,
      name,
      mainProcess(),
      TAIL,
      (line) => append([line])
    );
    leaveJournal = journal.cancel;

    await journal.done;
  }

  async function declare(serverId: string): Promise<boolean> {
    const added = await step("add", serverId, () =>
      window.pupitre.addProject(serverId, get().params())
    );

    if (added.ok) {
      mark(
        "add",
        "ok",
        `${added.result.dir} · ${added.result.processes
          .map((process) => `${process.id}:${process.port}`)
          .join(" · ")}`
      );

      return true;
    }

    const suggested = portFromRemedy(added.error.remedy);

    if (suggested) {
      takePort(suggested);
    }

    fail("add", added.error);

    return false;
  }

  type Sources = "failed" | "pulled" | "skipped";

  /**
   * The sources, when they are not on the machine yet.
   *
   * A folder the reader pointed at is already there; an address has to be
   * cloned. The clone is all this phase does — the dependencies are the next
   * one's, so each of the two says how long it took.
   */
  async function bringSources(
    serverId: string,
    name: string
  ): Promise<Sources> {
    const { source, kind } = get().draft;

    if (kind === "dir") {
      mark("sources", "skip", translate()("projectAdd.sources.alreadyPresent"));

      return "skipped";
    }

    const pulled = await step("sources", serverId, () =>
      window.pupitre.pullProject(serverId, name)
    );

    if (!pulled.ok) {
      fail("sources", pulled.error);

      return "failed";
    }

    mark("sources", "ok", pulled.result.pulled ? source : undefined);

    return "pulled";
  }

  /** The install line the agent ran is the phase's detail; a project that declares none skips it. */
  async function installDeps(serverId: string, name: string): Promise<boolean> {
    const installed = await step("install", serverId, () =>
      window.pupitre.installProject(serverId, name)
    );

    if (!installed.ok) {
      await readLogs(serverId, name);
      fail("install", installed.error);

      return false;
    }

    const ran = installed.result.installed;

    if (ran.length > 0) {
      mark(
        "install",
        "ok",
        ran.map((one) => `${one.process}: ${one.command}`).join(" · ")
      );
    } else {
      mark("install", "skip", translate()("projectAdd.install.nothing"));
    }

    return true;
  }

  const IDLE_STATES: readonly ProjectState[] = ["failed", "stopped", "down"];

  /**
   * The state once the start has settled: the port bound, or the command gone.
   *
   * `project.up` answers the moment the window opens, which is always
   * "starting" for a server worth the name. What follows is read off the
   * machine on the dashboard's beat, until the state moves or the reads run
   * out; a read that fails keeps the last state known.
   */
  async function settle(
    serverId: string,
    name: string,
    initial: ProjectState
  ): Promise<ProjectState> {
    let state = initial;

    for (let read = 0; read < SETTLE_READS && state === "starting"; read++) {
      await delay(get().settleMs);

      const answer = await agentPoll<ProjectListResult>(
        serverId,
        "project.list"
      );

      if (answer.ok) {
        state =
          answer.result.projects.find((project) => project.name === name)
            ?.state ?? state;
      }
    }

    return state;
  }

  /**
   * The start, and the state the project settles on after it.
   *
   * A command that dies on the spot leaves a project the agent calls stopped
   * or failed rather than an error, so the state is read as well as the
   * envelope — and either way the journal is fetched before the screen says
   * anything.
   */
  async function bringUp(
    serverId: string,
    name: string
  ): Promise<{ state: ProjectState } | null> {
    const started = await step("up", serverId, () =>
      window.pupitre.startProject(serverId, name)
    );

    if (!started.ok) {
      await readLogs(serverId, name);
      fail("up", started.error);

      return null;
    }

    const state = await settle(serverId, name, started.result.state);

    if (IDLE_STATES.includes(state)) {
      await readLogs(serverId, name);
      fail("up", {
        code: "internal",
        fix: translate()("projectAdd.up.notRunningFix"),
        message: translate()("projectAdd.up.notRunningMessage", {
          name,
          state,
        }),
      });

      return null;
    }

    mark("up", "ok", translate()(`state.project.${state}`));

    return { state };
  }

  /**
   * The name on the web, when the project has one.
   *
   * The agent wrote the route; the record that makes the name answer is the
   * app's, written from the account it holds. A project that is not published
   * has nothing to do here.
   */
  async function publishRoute(serverId: string): Promise<boolean> {
    const published = publishedSubdomains(
      get().draft.processes,
      get().exposure !== null
    );

    if (published.length === 0) {
      mark("publish", "skip", translate()("projectAdd.publish.local"));

      return true;
    }

    mark("publish", "running");
    set({
      run: {
        name: get().draft.name,
        phase: "publish",
        serverId,
        status: "running",
      },
    });

    await useTunnel.getState().sync(serverId);

    const refused = useTunnel.getState().problem;

    if (refused) {
      fail("publish", refused);

      return false;
    }

    mark("publish", "ok", published.join(" · "));

    return true;
  }

  async function finish(
    serverId: string,
    name: string,
    state: ProjectState
  ): Promise<void> {
    const address = await step("logs", serverId, () =>
      window.pupitre.projectAddress(serverId, name)
    );

    if (!address.ok) {
      fail("logs", address.error);

      return;
    }

    mark("logs", "ok", address.result.url);
    set({
      run: {
        name,
        serverId,
        state,
        status: "done",
        url: address.result.url,
      },
    });

    await follow(serverId, name);
  }

  /** The chain, from the phase it is asked to start at. */
  async function sequence(serverId: string, from: PhaseId): Promise<void> {
    const start = PHASES.indexOf(from);
    const name = get().draft.name;

    set((state) => ({
      phases: state.phases.map((phase, index) =>
        index >= start ? { id: phase.id, status: "pending" } : phase
      ),
      run: { name, phase: from, serverId, status: "running" },
    }));

    if (start <= PHASES.indexOf("add") && !(await declare(serverId))) {
      return;
    }

    const sources =
      start <= PHASES.indexOf("sources")
        ? await bringSources(serverId, name)
        : "skipped";

    if (sources === "failed") {
      return;
    }

    if (
      start <= PHASES.indexOf("install") &&
      !(await installDeps(serverId, name))
    ) {
      return;
    }

    const started =
      start <= PHASES.indexOf("up")
        ? await bringUp(serverId, name)
        : { state: "online" as ProjectState };

    if (!started) {
      return;
    }

    if (start <= PHASES.indexOf("publish") && !(await publishRoute(serverId))) {
      return;
    }

    await finish(serverId, name, started.state);
  }

  return {
    detected: false,
    detection: { status: "idle" },
    draft: EMPTY_DRAFT,
    exposure: null,
    folders: { status: "idle" },
    edited: UNTOUCHED,
    known: { status: "idle" },
    logs: [],
    phases: pending(),
    repos: { status: "idle" },
    run: { status: "idle" },
    settleMs: SETTLE_POLL_MS,

    async prepare(serverId, exposure) {
      set({
        exposure,
        known: { serverId, status: "loading" },
      });

      const answer: AgentResponse<ProjectListResult> =
        await window.pupitre.listProjects(serverId);

      if (!answer.ok) {
        set({ known: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      set({
        known: {
          projects: answer.result.projects,
          serverId,
          status: "ready",
        },
      });

      if (!get().edited.processes) {
        const { processes } = get().draft;
        const port = freePort(heldBy(answer.result.projects).ports);

        refresh({ processes: atRow(processes, 0, 0, { port }) });
      }
    },

    /** Another way in is another source: nothing of the last one is carried over. */
    setKind(kind) {
      if (kind === get().draft.kind) {
        return;
      }

      forgetDetection();
      refresh({ branch: "", kind, privateRepo: false, source: "" });
    },

    /** Another source is another repository: what the agent read is read no more. */
    setSource(value) {
      if (value.trim() !== get().draft.source.trim()) {
        forgetDetection();
      }

      refresh({ source: value });
    },

    setName(value) {
      refresh({ name: value }, { name: true });
    },

    /** Another branch is another tree: what the agent read of the last one no longer holds. */
    setBranch(value) {
      if (value.trim() !== get().draft.branch.trim()) {
        forgetDetection();
      }

      refresh({ branch: value });
    },

    setProcessId(process, value) {
      refresh(
        { processes: atProcess(get().draft.processes, process, { id: value }) },
        { processes: true }
      );
    },

    setProcessDir(process, value) {
      refresh(
        {
          processes: atProcess(get().draft.processes, process, { dir: value }),
        },
        { processes: true }
      );
    },

    setProcessPkgmgr(process, value) {
      refresh(
        {
          processes: atProcess(get().draft.processes, process, {
            pkgmgr: value,
          }),
        },
        { processes: true }
      );
    },

    setProcessCmd(process, value) {
      refresh(
        {
          processes: atProcess(get().draft.processes, process, {
            cmd: value,
            ownCmd: true,
          }),
        },
        { processes: true }
      );
    },

    setProcessInstall(process, value) {
      refresh(
        {
          processes: atProcess(get().draft.processes, process, {
            install: value,
          }),
        },
        { processes: true }
      );
    },

    setRowLabel(process, row, value) {
      refresh(
        {
          processes: atRow(get().draft.processes, process, row, {
            label: value,
          }),
        },
        { processes: true }
      );
    },

    setRowPort(process, row, value) {
      refresh(
        {
          processes: atRow(get().draft.processes, process, row, {
            port: value,
          }),
        },
        { processes: true }
      );
    },

    setRowPublish(process, row, value) {
      refresh({
        processes: atRow(get().draft.processes, process, row, {
          publish: value,
        }),
      });
    },

    setRowWeb(process, row, value) {
      refresh({
        processes: atRow(get().draft.processes, process, row, {
          ownWeb: true,
          web: value,
        }),
      });
    },

    /**
     * The field goes back to the proposal, and to following the name.
     *
     * Generating is the reader handing the name back to the app, so what
     * comes after — another repository, another name — is followed again; a
     * value they type themselves stays theirs.
     */
    generateRowWeb(process, row) {
      refresh({
        processes: atRow(get().draft.processes, process, row, {
          ownWeb: false,
          whole: false,
        }),
      });
    },

    addRow(process) {
      const { draft, known, exposure } = get();
      const current = draft.processes[process];

      if (!current) {
        return;
      }

      refresh(
        {
          processes: atProcess(draft.processes, process, {
            rows: [
              ...current.rows,
              addedRow(
                current.rows,
                heldOf(known, draft.name),
                exposure !== null
              ),
            ],
          }),
        },
        { processes: true }
      );
    },

    /** The first row is the main port, and a process always has one: it cannot go. */
    removeRow(process, row) {
      const { draft } = get();
      const current = draft.processes[process];

      if (!current || row === 0 || current.rows.length <= 1) {
        return;
      }

      refresh(
        {
          processes: atProcess(draft.processes, process, {
            rows: current.rows.filter((_row, at) => at !== row),
          }),
        },
        { processes: true }
      );
    },

    addProcess() {
      const { draft, known, exposure } = get();

      refresh(
        {
          processes: [
            ...draft.processes,
            addedProcess(
              draft.processes,
              heldOf(known, draft.name),
              exposure !== null
            ),
          ],
        },
        { processes: true }
      );
    },

    /** A project always has a process: the last one cannot go. */
    removeProcess(process) {
      const { processes } = get().draft;

      if (processes.length <= 1) {
        return;
      }

      refresh(
        { processes: processes.filter((_process, at) => at !== process) },
        { processes: true }
      );
    },

    /**
     * The repositories of the connected account.
     *
     * The token that reads them never comes here: the main process holds it,
     * calls GitHub and answers a list. A computer with no account connected is
     * not an error — the screen shows the way to the settings.
     */
    async loadRepos(refreshList = false) {
      set({ repos: { status: "loading" } });

      const answer = await window.pupitre.githubRepos(refreshList);

      if (answer.ok) {
        set({ repos: { repos: answer.result, status: "ready" } });

        return;
      }

      set({
        repos:
          answer.error.phrase?.id === "refusal.connection.absent"
            ? { status: "absent" }
            : { error: answer.error, status: "failed" },
      });
    },

    pickRepo(repo) {
      forgetDetection();
      refresh({
        branch: repo.defaultBranch,
        privateRepo: repo.private,
        source: repo.cloneUrl,
      });
    },

    /**
     * A folder of the server, listed under the projects root and never above it.
     *
     * `fs.list` counts from the working folder of the projects account, and a
     * project's `dir` counts from the projects folder inside it. The agent
     * names that folder itself — `completions` carries its root — so nothing
     * here concatenates a path the contract does not give.
     */
    async browse(serverId, path) {
      set({ folders: { path, status: "loading" } });

      if (projectsFolder === null) {
        const named = await window.pupitre.completions(serverId);

        if (!named.ok) {
          set({ folders: { error: named.error, path, status: "failed" } });

          return;
        }

        projectsFolder =
          named.result.root.split("/").filter(Boolean).at(-1) ?? "";
      }

      const answer = await agentCall<FsListResult>(serverId, "fs.list", {
        path: under(projectsFolder, path),
      });

      if (!answer.ok) {
        set({ folders: { error: answer.error, path, status: "failed" } });

        return;
      }

      set({
        folders: {
          folders: answer.result.entries
            .filter((entry) => entry.kind === "dir")
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right)),
          path,
          status: "ready",
        },
      });
    },

    async makeFolder(serverId, name) {
      const { folders } = get();
      const path = folders.status === "idle" ? "" : folders.path;
      const wanted = under(path, name.trim());

      if (projectsFolder === null || name.trim().length === 0) {
        return;
      }

      const answer = await agentCall<FsPathResult>(serverId, "fs.mkdir", {
        path: under(projectsFolder, wanted),
      });

      if (!answer.ok) {
        set({ folders: { error: answer.error, path, status: "failed" } });

        return;
      }

      await get().browse(serverId, path);
    },

    pickFolder(path) {
      forgetDetection();
      refresh({ source: path });
    },

    /**
     * What the repository asks for, read by the agent before anything is
     * declared: the manager it locks, the script it starts on, the port it
     * wants if the server has it free. A project the server already declares
     * has said all of that itself.
     */
    async detect(serverId) {
      const source = get().draft.source.trim();
      const { detection } = get();

      if (
        source.length === 0 ||
        get().detected ||
        (detection.status !== "idle" && detection.source === source)
      ) {
        return;
      }

      const params = detectParams(get().draft);

      set({
        detection: {
          source,
          status: "reading",
          ...("branch" in params && params.branch
            ? { branch: params.branch }
            : {}),
        },
      });

      const answer = (await window.pupitre.agentCall(
        serverId,
        "project.detect",
        params
      )) as AgentResponse<ProjectDetectResult>;

      // The reader moved on to another source while the agent was reading.
      if (get().draft.source.trim() !== source) {
        return;
      }

      if (!answer.ok) {
        set({ detection: { error: answer.error, source, status: "failed" } });

        return;
      }

      const { edited, exposure } = get();

      set({ detection: { result: answer.result, source, status: "read" } });

      if (edited.processes) {
        return;
      }

      refresh({
        processes: processesFromDetection(answer.result, exposure !== null),
      });
    },

    async launch(serverId) {
      set({ logs: [], phases: pending() });

      await sequence(serverId, "add");
    },

    /** Picks up at the phase that failed: what worked is not done again. */
    async retry(serverId) {
      const { run } = get();

      await sequence(serverId, run.status === "failed" ? run.phase : "add");
    },

    /**
     * The screen closes, the draft does not.
     *
     * The reader who leaves to connect a GitHub account or to install a module
     * comes back to the form they had filled in; what goes is the run and the
     * journal, which belong to an attempt that is over.
     */
    park() {
      leaveJournal?.();
      leaveJournal = null;
      set({ logs: [], phases: pending(), run: { status: "idle" } });
    },

    reset() {
      projectsFolder = null;
      leaveJournal?.();
      leaveJournal = null;
      set({
        detected: false,
        detection: { status: "idle" },
        draft: EMPTY_DRAFT,
        edited: UNTOUCHED,
        exposure: null,
        folders: { status: "idle" },
        known: { status: "idle" },
        logs: [],
        phases: pending(),
        repos: { status: "idle" },
        run: { status: "idle" },
      });
    },

    params() {
      const { draft, exposure } = get();
      const branch = draft.branch.trim();

      return {
        dir: draft.dir,
        name: draft.name,
        processes: processRequests(draft.processes, exposure !== null),
        ...(draft.kind === "dir" ? {} : { repo: draft.source.trim() }),
        ...(draft.kind === "dir" || !branch ? {} : { branch }),
      };
    },

    /**
     * What the agent applies, applied here first.
     *
     * A port a project already holds, a name on the web one already answers to
     * or that DNS would not carry are all refused by the registry; catching them
     * here is what keeps the button from sending a form that comes back with a
     * phase in failure.
     */
    processProblem(process) {
      return processProblem(get().draft.processes, process);
    },

    rowProblems(process) {
      const { draft, exposure, known } = get();

      return rowProblems(
        draft.processes,
        process,
        heldOf(known, draft.name),
        exposure !== null
      );
    },

    ready() {
      const { draft, exposure, known } = get();

      return (
        PROJECT_NAME.test(draft.name) &&
        draft.dir.length > 0 &&
        (draft.kind === "dir" || draft.source.trim().length > 0) &&
        processesReady(
          draft.processes,
          heldOf(known, draft.name),
          exposure !== null
        )
      );
    },
  };
});
