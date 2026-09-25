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
import { agentCall } from "../lib/agent-call";
import {
  FIRST_PORT,
  folderFromSource,
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
  onFreePorts,
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

const LOG_KEPT = 500;

const TAIL = 200;

const SETTLE_POLL_MS = 2000;

/** About a minute of polling; a slower start (e.g. Grails) is not a failure, the outcome keeps following the state. */
export const SETTLE_READS = 30;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export function nameRefused(name: string): boolean {
  return name !== "" && !PROJECT_NAME.test(name);
}

export const CLOUDFLARE = "exposure.cloudflare";

export const CADDY = "exposure.caddy";

/** Behind Caddy the client writes their own DNS records, so the screen shows them `host`. */
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

/** Puts a git identity and a key on the machine: without it a private clone fails. */
export const GITHUB_TOOL = "tool.github";

export const SOURCE_KINDS = ["github", "git", "dir"] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export type AddStep = "source" | "config";

// "publish" follows "add" directly: a failed clone or install is no reason to leave the route unwritten.
export const PHASES = [
  "add",
  "publish",
  "sources",
  "install",
  "up",
  "logs",
] as const;

export type PhaseId = (typeof PHASES)[number];

export type PhaseStatus = "pending" | "running" | "ok" | "skip" | "fail";

export interface Phase {
  id: PhaseId;
  status: PhaseStatus;
  detail?: string;
  /** Refused by the agent after the row was written: the phase still stands. */
  warnings?: string[];
}

export interface Draft {
  kind: SourceKind;
  /** A repository address, or a folder relative to the projects root. */
  source: string;
  /** Cloning a private repository needs the GitHub module. */
  privateRepo: boolean;
  /** Empty means the repository's own default branch. */
  branch: string;
  name: string;
  dir: string;
  /** The first one is the main one. */
  processes: ProcessDraft[];
  startNow: boolean;
  boot: boolean;
}

interface Edited {
  name: boolean;
  /** Once the reader edits the list, a detection no longer replaces it. */
  processes: boolean;
}

export type KnownState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "ready"; serverId: string; projects: readonly Project[] }
  | { status: "failed"; serverId: string; error: AgentError };

export type DetectionState =
  | { status: "idle" }
  /** An absent `branch` means the repository's default one. */
  | { status: "reading"; source: string; branch?: string }
  | { status: "read"; source: string; result: ProjectDetectResult }
  | { status: "failed"; source: string; error: AgentError };

/** `absent` is not a failure: no GitHub account is connected yet. */
export type ReposState =
  | { status: "idle" }
  | { status: "absent" }
  | { status: "loading" }
  | { status: "ready"; repos: readonly GithubRepo[] }
  | { status: "failed"; error: AgentError };

/** `path` is relative to the projects root, like a project's `dir`, and browsing never leaves it. */
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
  step: AddStep;
  repos: ReposState;
  folders: FolderState;
  exposure: Exposure | null;
  phases: Phase[];
  logs: string[];
  run: ProjectAddState;
  /** Poll interval after a start, held in state so tests can shorten it. */
  settleMs: number;

  prepare: (serverId: string, exposure: Exposure | null) => Promise<void>;
  setKind: (kind: SourceKind) => void;
  setSource: (value: string) => void;
  setName: (value: string) => void;
  setBranch: (value: string) => void;
  setStartNow: (value: boolean) => void;
  setBoot: (value: boolean) => void;
  setProcessId: (process: number, value: string) => void;
  setProcessDir: (process: number, value: string) => void;
  setProcessPkgmgr: (process: number, value: PackageManager) => void;
  setProcessCmd: (process: number, value: string) => void;
  setProcessInstall: (process: number, value: string) => void;
  setRowLabel: (process: number, row: number, value: string) => void;
  setRowPort: (process: number, row: number, value: number) => void;
  setRowPublish: (process: number, row: number, value: boolean) => void;
  setRowWeb: (process: number, row: number, value: string) => void;
  generateRowWeb: (process: number, row: number) => void;
  addRow: (process: number) => void;
  removeRow: (process: number, row: number) => void;
  addProcess: () => void;
  removeProcess: (process: number) => void;
  loadRepos: (refresh?: boolean) => Promise<void>;
  pickRepo: (repo: GithubRepo) => void;
  browse: (serverId: string, path: string) => Promise<void>;
  makeFolder: (serverId: string, name: string) => Promise<AgentError | null>;
  pickFolder: (path: string) => void;
  detect: (serverId: string) => Promise<void>;
  skipReading: () => void;
  editSource: () => void;

  launch: (serverId: string) => Promise<void>;
  retry: (serverId: string) => Promise<void>;
  /** Unlike reset, keeps the draft: a reader who leaves to connect GitHub or install a module finds the form again. */
  park: () => void;
  reset: () => void;

  params: () => ProjectAddParams;
  declared: () => Project | null;
  ready: () => boolean;
  processProblem: (process: number) => ProcessProblem | null;
  rowProblems: (process: number) => (RowProblem | null)[];
}

const EMPTY_DRAFT: Draft = {
  boot: false,
  branch: "",
  dir: "",
  kind: "github",
  name: "",
  privateRepo: false,
  processes: [firstProcess(FIRST_PORT, true)],
  source: "",
  startNow: true,
};

const UNTOUCHED: Edited = {
  name: false,
  processes: false,
};

function pending(): Phase[] {
  return PHASES.map((id) => ({ id, status: "pending" }));
}

// Includes the declared project the draft may name again.
function heldOf(known: KnownState): Held {
  return known.status === "ready"
    ? heldBy(known.projects)
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

/** Optional params at their default are left out: agents older than `boot` and `runtimes` refuse unknown keys. */
export type ProjectAddRequest = Omit<ProjectAddParams, "boot"> & {
  boot?: boolean;
};

export function requestOf(params: ProjectAddParams): ProjectAddRequest {
  const { boot, runtimes, ...rest } = params;

  return {
    ...rest,
    ...(boot ? { boot: true } : {}),
    ...(runtimes && Object.keys(runtimes).length > 0 ? { runtimes } : {}),
  };
}

function detectParams(draft: Draft): ProjectDetectParams {
  const source = draft.source.trim();
  const branch = draft.branch.trim();

  if (draft.kind === "dir") {
    return { dir: draft.dir };
  }

  return { repo: source, ...(branch ? { branch } : {}) };
}

function under(path: string, name: string): string {
  return [path, name].filter(Boolean).join("/");
}

export const useProjectAdd = create<ProjectAddStore>((set, get) => {
  let leaveJournal: (() => void) | null = null;
  // The projects root the agent named, read once per server.
  let projectsFolder: string | null = null;

  function append(lines: readonly string[]): void {
    if (lines.length === 0) {
      return;
    }

    set((state) => ({ logs: [...state.logs, ...lines].slice(-LOG_KEPT) }));
  }

  function mark(
    id: PhaseId,
    status: PhaseStatus,
    detail?: string,
    warnings: readonly string[] = []
  ): void {
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === id
          ? {
              id,
              status,
              ...(detail ? { detail } : {}),
              ...(warnings.length > 0 ? { warnings: [...warnings] } : {}),
            }
          : phase
      ),
    }));
  }

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
      heldSubdomains(heldOf(known).hostnames)
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

  // The remedy names a free port, not the row: the first row on a held port is taken to be the one that collided.
  function takePort(free: number): void {
    const { draft, known } = get();
    const held = heldOf(known).ports;

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

  function forgetDetection(): void {
    const { draft, edited, exposure } = get();

    set({ detection: { status: "idle" } });

    if (edited.processes) {
      return;
    }

    const port = draft.processes[0]?.rows[0]?.port ?? FIRST_PORT;

    refresh({ processes: [firstProcess(port, exposure !== null)] });
  }

  function mainProcess(): string {
    return get().draft.processes[0]?.id ?? "";
  }

  // Every process's journal, so a project that never started still says why.
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
      window.pupitre.addProject(
        serverId,
        // The schema type requires `boot`; the wire omits it at its default for agents with closed params.
        requestOf(get().params()) as ProjectAddParams
      )
    );

    if (added.ok) {
      mark(
        "add",
        "ok",
        `${added.result.dir} · ${added.result.processes
          .map((process) => `${process.id}:${process.port}`)
          .join(" · ")}`,
        added.result.warnings
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

  // `project.up` answers while still "starting", so the state is polled until it moves or the reads run out.
  async function settle(
    serverId: string,
    name: string,
    initial: ProjectState
  ): Promise<{ state: ProjectState } | { refused: AgentError }> {
    let state = initial;

    for (let read = 0; read < SETTLE_READS && state === "starting"; read++) {
      await delay(get().settleMs);

      const answer: AgentResponse<ProjectListResult> =
        await window.pupitre.listProjects(serverId);

      if (!answer.ok) {
        return { refused: answer.error };
      }

      state =
        answer.result.projects.find((project) => project.name === name)
          ?.state ?? state;
    }

    return { state };
  }

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

    const settled = await settle(serverId, name, started.result.state);

    if ("refused" in settled) {
      await readLogs(serverId, name);
      fail("up", settled.refused);

      return null;
    }

    const { state } = settled;

    // A command that dies on the spot comes back as a stopped or failed state, not an error.
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

  function startIfAsked(
    serverId: string,
    name: string,
    start: number
  ): Promise<{ state: ProjectState } | null> {
    // A retry past the start assumes it was made.
    if (start > PHASES.indexOf("up")) {
      return Promise.resolve({ state: "online" });
    }

    if (!get().draft.startNow) {
      mark("up", "skip", translate()("projectAdd.up.notAsked"));

      return Promise.resolve({ state: "stopped" });
    }

    return bringUp(serverId, name);
  }

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

    if (start <= PHASES.indexOf("publish") && !(await publishRoute(serverId))) {
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

    const started = await startIfAsked(serverId, name, start);

    if (!started) {
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
    step: "source",

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
        refresh({
          processes: onFreePorts(
            get().draft.processes,
            heldBy(answer.result.projects)
          ),
        });
      }
    },

    setKind(kind) {
      if (kind === get().draft.kind) {
        return;
      }

      forgetDetection();
      refresh({ branch: "", kind, privateRepo: false, source: "" });
    },

    setSource(value) {
      if (value.trim() !== get().draft.source.trim()) {
        forgetDetection();
      }

      refresh({ source: value });
    },

    setName(value) {
      refresh({ name: value }, { name: true });
    },

    setStartNow(value) {
      refresh({ startNow: value });
    },

    setBoot(value) {
      refresh({ boot: value });
    },

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

    // Hands the name back to the app: later source or name changes are followed again.
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
              addedRow(current.rows, heldOf(known), exposure !== null),
            ],
          }),
        },
        { processes: true }
      );
    },

    // The first row is the main port and cannot go.
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
            addedProcess(draft.processes, heldOf(known), exposure !== null),
          ],
        },
        { processes: true }
      );
    },

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

    // The GitHub token stays in the main process, which answers only the list.
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

    // `fs.list` counts from the projects account's home, `dir` from the projects folder `completions` names.
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
        return null;
      }

      const answer = await agentCall<FsPathResult>(serverId, "fs.mkdir", {
        path: under(projectsFolder, wanted),
      });

      if (!answer.ok) {
        return answer.error;
      }

      await get().browse(serverId, path);

      return null;
    },

    pickFolder(path) {
      forgetDetection();
      refresh({ source: path });
    },

    async detect(serverId) {
      const source = get().draft.source.trim();
      const { detection } = get();
      const same = detection.status !== "idle" && detection.source === source;

      if (source.length === 0 || get().detected) {
        return;
      }

      if (same && detection.status === "read") {
        set({ step: "config" });

        return;
      }

      if (same && detection.status === "reading") {
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

      set({
        detection: { result: answer.result, source, status: "read" },
        step: "config",
      });

      if (edited.processes) {
        return;
      }

      refresh({
        processes: processesFromDetection(
          answer.result,
          exposure !== null,
          heldOf(get().known)
        ),
      });
    },

    skipReading() {
      if (get().draft.source.trim().length > 0) {
        set({ step: "config" });
      }
    },

    editSource() {
      set({ step: "source" });
    },

    async launch(serverId) {
      set({ logs: [], phases: pending() });

      await sequence(serverId, "add");
    },

    async retry(serverId) {
      const { run } = get();

      await sequence(serverId, run.status === "failed" ? run.phase : "add");
    },

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
        step: "source",
      });
    },

    params() {
      const { draft, exposure } = get();
      const branch = draft.branch.trim();

      return {
        boot: draft.boot,
        dir: draft.dir,
        name: draft.name,
        processes: processRequests(draft.processes, exposure !== null),
        ...(draft.kind === "dir" ? {} : { repo: draft.source.trim() }),
        ...(draft.kind === "dir" || !branch ? {} : { branch }),
      };
    },

    processProblem(process) {
      return processProblem(get().draft.processes, process);
    },

    // A declared project is refused as a whole: its rows are not weighed against itself.
    rowProblems(process) {
      const { draft, exposure, known } = get();

      if (get().declared()) {
        return (draft.processes[process]?.rows ?? []).map(() => null);
      }

      return rowProblems(
        draft.processes,
        process,
        heldOf(known),
        exposure !== null
      );
    },

    declared() {
      const { draft, known } = get();

      return declaredAt(known, draft.name, draft.dir);
    },

    ready() {
      const { draft, exposure, known } = get();

      return (
        !get().declared() &&
        PROJECT_NAME.test(draft.name) &&
        draft.dir.length > 0 &&
        (draft.kind === "dir" || draft.source.trim().length > 0) &&
        processesReady(draft.processes, heldOf(known), exposure !== null)
      );
    },
  };
});
