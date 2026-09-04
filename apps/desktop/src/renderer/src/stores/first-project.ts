import type {
  ProjectAddParams,
  ProjectListResult,
} from "@pupitre/shared/agent-protocol/projects";
import type {
  PackageManager,
  Project,
  ProjectState,
} from "@pupitre/shared/agent-protocol/state";
import type { AgentError, AgentResponse } from "@shared/agent";
import { create } from "zustand";
import {
  folderFromSource,
  freePort,
  isGitSource,
  nameFromSource,
  portFromFix,
  startCommand,
} from "../lib/project-draft";

/**
 * The first project of a freshly installed server, from an address to a journal.
 *
 * The order is the whole of it: declare the project, bring its sources and its
 * dependencies, start it, then read its journal and its address. Nothing here
 * decides anything the agent has not said — a refused port comes back with the
 * free one in its remedy, and that is the port the form then proposes.
 */

const HOST = "127.0.0.1";

const LOG_KEPT = 500;

const TAIL = 200;

const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const CLOUDFLARE = "exposure.cloudflare";

export const PHASES = ["add", "sources", "install", "up", "logs"] as const;

/**
 * Whether this machine publishes projects, and so whether a subdomain means
 * anything on this screen. What the probe found and what the install just put
 * there both count; a module that failed does not.
 */
export function hasCloudflare(
  present: readonly string[],
  installed: readonly string[],
  failed: readonly string[]
): boolean {
  return (
    present.includes(CLOUDFLARE) ||
    (installed.includes(CLOUDFLARE) && !failed.includes(CLOUDFLARE))
  );
}

export type PhaseId = (typeof PHASES)[number];

export type PhaseStatus = "pending" | "running" | "ok" | "skip" | "fail";

export interface Phase {
  id: PhaseId;
  status: PhaseStatus;
  detail?: string;
}

export interface Draft {
  source: string;
  name: string;
  dir: string;
  pkgmgr: PackageManager;
  port: number;
  subdomain: string;
  cmd: string;
}

/** What the reader has taken over, and what still follows the source. */
interface Edited {
  name: boolean;
  port: boolean;
  cmd: boolean;
  subdomain: boolean;
}

export type KnownState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "ready"; serverId: string; projects: readonly Project[] }
  | { status: "failed"; serverId: string; error: AgentError };

export type FirstProjectState =
  | { status: "idle" }
  | { status: "running"; serverId: string; name: string; phase: PhaseId }
  | {
      status: "done";
      serverId: string;
      name: string;
      state: ProjectState;
      port?: number;
      url?: string;
    }
  | {
      status: "failed";
      serverId: string;
      name: string;
      phase: PhaseId;
      error: AgentError;
    };

interface FirstProjectStore {
  known: KnownState;
  draft: Draft;
  edited: Edited;
  /** True when the package manager came from a project the agent already knows. */
  detected: boolean;
  cloudflare: boolean;
  phases: Phase[];
  logs: string[];
  run: FirstProjectState;

  prepare: (serverId: string, cloudflare: boolean) => Promise<void>;
  setSource: (value: string) => void;
  setName: (value: string) => void;
  setPkgmgr: (value: PackageManager) => void;
  setPort: (value: number) => void;
  setSubdomain: (value: string) => void;
  setCmd: (value: string) => void;

  launch: (serverId: string) => Promise<void>;
  retry: (serverId: string) => Promise<void>;
  reset: () => void;

  params: () => ProjectAddParams;
  ready: () => boolean;
}

const EMPTY_DRAFT: Draft = {
  cmd: "",
  dir: "",
  name: "",
  pkgmgr: "bun",
  port: 3000,
  source: "",
  subdomain: "",
};

const UNTOUCHED: Edited = {
  cmd: false,
  name: false,
  port: false,
  subdomain: false,
};

function pending(): Phase[] {
  return PHASES.map((id) => ({ id, status: "pending" }));
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

export const useFirstProject = create<FirstProjectStore>((set, get) => {
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

  function derive(draft: Draft, edited: Edited, cloudflare: boolean): Draft {
    const name = edited.name ? draft.name : nameFromSource(draft.source);
    const dir = folderFromSource(draft.source, name);
    const cmd = edited.cmd ? draft.cmd : startCommand(draft.pkgmgr, draft.port);
    let subdomain = draft.subdomain;

    if (!edited.subdomain) {
      subdomain = cloudflare ? name : "";
    }

    return { ...draft, cmd, dir, name, subdomain };
  }

  function refresh(next: Partial<Draft>, touched: Partial<Edited> = {}): void {
    const { draft, edited, cloudflare, known } = get();
    const merged = { ...edited, ...touched };
    const wanted = derive({ ...draft, ...next }, merged, cloudflare);
    const already = declaredAt(known, wanted.name, wanted.dir);

    if (!already) {
      set({ draft: wanted, detected: false, edited: merged });

      return;
    }

    set({
      detected: true,
      draft: {
        ...wanted,
        cmd: merged.cmd ? wanted.cmd : already.cmd,
        pkgmgr: already.pkgmgr,
        port: merged.port ? wanted.port : already.port,
        subdomain: merged.subdomain
          ? wanted.subdomain
          : (already.subdomain ?? ""),
      },
      edited: merged,
    });
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
    call: () => Promise<AgentResponse<T>>
  ): Promise<AgentResponse<T>> {
    mark(id, "running");
    set({
      run: { name: get().draft.name, phase: id, serverId, status: "running" },
    });

    return call();
  }

  /** The journal, read once, so a project that never started still says why. */
  async function readLogs(serverId: string, name: string): Promise<void> {
    const answer = await window.pupitre.projectJournal(
      serverId,
      name,
      TAIL,
      false,
      (line) => append([line])
    );

    if (answer.ok) {
      append(answer.result.lines);
    }
  }

  async function follow(serverId: string, name: string): Promise<void> {
    await window.pupitre.projectJournal(serverId, name, TAIL, true, (line) =>
      append([line])
    );
  }

  /** The project's row in the registry, and the port the agent will take. */
  async function declare(serverId: string): Promise<boolean> {
    const added = await step("add", serverId, () =>
      window.pupitre.addProject(serverId, get().params())
    );

    if (added.ok) {
      mark("add", "ok", `${added.result.dir} · port ${added.result.port}`);

      return true;
    }

    const suggested = portFromFix(added.error.fix);

    if (suggested && suggested !== get().draft.port) {
      refresh({ port: suggested });
    }

    fail("add", added.error);

    return false;
  }

  type Sources = "failed" | "installed" | "pulled" | "skipped";

  /**
   * The sources, when they are not on the machine yet.
   *
   * A folder the reader pointed at is already there; an address has to be
   * cloned, and the agent's clone installs the dependencies on its way, which
   * is why the next phase then has nothing left to do.
   */
  async function bringSources(
    serverId: string,
    name: string
  ): Promise<Sources> {
    const { source } = get().draft;

    if (!isGitSource(source)) {
      mark("sources", "skip", "le dossier est déjà sur le serveur");

      return "skipped";
    }

    const synced = await step("sources", serverId, () =>
      window.pupitre.syncProject(serverId, name)
    );

    if (!synced.ok) {
      fail("sources", synced.error);

      return "failed";
    }

    mark("sources", "ok", synced.result.pulled ? source : undefined);

    return synced.result.installed ? "installed" : "pulled";
  }

  async function installDeps(
    serverId: string,
    name: string,
    already: boolean
  ): Promise<boolean> {
    if (already) {
      mark("install", "skip", "faite avec la récupération des sources");

      return true;
    }

    const installed = await step("install", serverId, () =>
      window.pupitre.installProject(serverId, name)
    );

    if (!installed.ok) {
      await readLogs(serverId, name);
      fail("install", installed.error);

      return false;
    }

    mark("install", "ok");

    return true;
  }

  const IDLE_STATES: readonly ProjectState[] = ["failed", "stopped", "down"];

  /**
   * The start, and the state the agent gives right after it.
   *
   * A command that dies on the spot leaves a project the agent calls stopped
   * rather than an error, so the state is read as well as the envelope — and
   * either way the journal is fetched before the screen says anything.
   */
  async function bringUp(
    serverId: string,
    name: string
  ): Promise<{ state: ProjectState; port?: number } | null> {
    const started = await step("up", serverId, () =>
      window.pupitre.startProject(serverId, name)
    );

    if (!started.ok) {
      await readLogs(serverId, name);
      fail("up", started.error);

      return null;
    }

    const { state, port } = started.result;

    if (IDLE_STATES.includes(state)) {
      await readLogs(serverId, name);
      fail("up", {
        code: "internal",
        fix: "Lis le journal ci-dessous, corrige la commande de démarrage, puis réessaie.",
        message: `${name} ne tourne pas : l'agent le donne ${state}.`,
      });

      return null;
    }

    mark("up", "ok", port ? `port ${port}` : undefined);

    return { state, ...(port ? { port } : {}) };
  }

  async function publish(
    serverId: string,
    name: string,
    state: ProjectState,
    port: number | undefined
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
        ...(port ? { port } : {}),
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
      !(await installDeps(serverId, name, sources === "installed"))
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

    await publish(serverId, name, started.state, started.port);
  }

  return {
    cloudflare: false,
    detected: false,
    draft: EMPTY_DRAFT,
    edited: UNTOUCHED,
    known: { status: "idle" },
    logs: [],
    phases: pending(),
    run: { status: "idle" },

    async prepare(serverId, cloudflare) {
      set({ cloudflare, known: { serverId, status: "loading" } });

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

      if (!get().edited.port) {
        refresh({ port: freePort(answer.result.projects.map((p) => p.port)) });
      }
    },

    setSource(value) {
      refresh({ source: value });
    },

    setName(value) {
      refresh({ name: value }, { name: true });
    },

    setPkgmgr(value) {
      refresh({ pkgmgr: value });
      set({ detected: false });
    },

    setPort(value) {
      refresh({ port: value }, { port: true });
    },

    setSubdomain(value) {
      refresh({ subdomain: value }, { subdomain: true });
    },

    setCmd(value) {
      refresh({ cmd: value }, { cmd: true });
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

    reset() {
      set({
        cloudflare: false,
        detected: false,
        draft: EMPTY_DRAFT,
        edited: UNTOUCHED,
        known: { status: "idle" },
        logs: [],
        phases: pending(),
        run: { status: "idle" },
      });
    },

    params() {
      const { draft, cloudflare } = get();
      const subdomain = cloudflare ? draft.subdomain.trim() : "";

      return {
        cmd: draft.cmd.trim(),
        dir: draft.dir,
        host: HOST,
        name: draft.name,
        pkgmgr: draft.pkgmgr,
        port: draft.port,
        ...(isGitSource(draft.source) ? { repo: draft.source.trim() } : {}),
        ...(subdomain ? { subdomain } : {}),
      };
    },

    ready() {
      const { draft } = get();

      return (
        PROJECT_NAME.test(draft.name) &&
        draft.dir.length > 0 &&
        draft.cmd.trim().length > 0
      );
    },
  };
});
