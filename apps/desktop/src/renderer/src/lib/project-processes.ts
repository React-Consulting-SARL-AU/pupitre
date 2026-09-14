import type {
  DetectedProcess,
  ProcessPatch,
  ProjectDetectResult,
} from "@pupitre/shared/agent-protocol/projects";
import {
  type PackageManager,
  PROJECT_ROOT_DIR,
  type ProcessRegistration,
  type Project,
} from "@pupitre/shared/agent-protocol/state";
import { FIRST_PORT, freePort, startCommand } from "./project-draft";
import {
  firstRow,
  followName,
  type Held,
  type PortRow,
  type RowProblem,
  routePatches,
  routeRequests,
  rowProblem,
  rowsFromDetection,
  rowsFromProcess,
  rowsReady,
  validLabel,
} from "./project-ports";

/**
 * The processes of a project, as the add and the configuration forms edit
 * them: what runs, from which folder, with which manager, on which ports.
 *
 * A project has one at the least. The first one is the main one — its first
 * port decides the project's local address and takes the project's bare name
 * on the web. Everything the agent proposed stays a proposal: a command
 * follows its port until the reader types one, and the registry is the one
 * that refuses.
 */

const HOST = "127.0.0.1";

/** The ids proposed to a process added by hand, in the order projects usually grow. */
const USUAL_IDS = ["app", "api", "web", "worker", "docs"];

const DIR_ESCAPES = /(^|\/)\.\.(\/|$)/;

export interface ProcessDraft {
  /** What tells one process from another on screen while their ids are typed. */
  key: string;
  id: string;
  /** Relative to the project's folder; empty means the root. */
  dir: string;
  pkgmgr: PackageManager;
  /** Empty hands the install to the package manager. */
  install: string;
  cmd: string;
  /** The loopback, or the `.localhost` name a start script freezes. */
  host: string;
  rows: PortRow[];
  /** True once the reader typed the command themselves: it stops following the port. */
  ownCmd: boolean;
  /** What the agent read off the folder: the command it starts on, and the port it asked for. */
  proposed: { cmd?: string; port?: number };
}

export type ProcessProblem = "id" | "idTaken" | "dir" | "cmd";

let keys = 0;

function nextKey(): string {
  keys += 1;

  return `process-${keys}`;
}

function draftOf(
  partial: Partial<ProcessDraft> & { rows: PortRow[] }
): ProcessDraft {
  return {
    cmd: "",
    dir: "",
    host: HOST,
    id: USUAL_IDS[0] ?? "app",
    install: "",
    key: nextKey(),
    ownCmd: false,
    pkgmgr: "bun",
    proposed: {},
    ...partial,
  };
}

/** The one process a fresh draft opens on: the root, on a free port. */
export function firstProcess(port: number, publish: boolean): ProcessDraft {
  return draftOf({ rows: [firstRow(port, publish)] });
}

/** The main port of a process: its first row's. */
export function mainPort(draft: Pick<ProcessDraft, "rows">): number {
  return draft.rows[0]?.port ?? FIRST_PORT;
}

/** The agent's command, on the port the reader settled on since. */
function proposedCommand(
  proposed: ProcessDraft["proposed"],
  port: number
): string | null {
  if (!proposed.cmd) {
    return null;
  }

  if (!proposed.port || proposed.port === port) {
    return proposed.cmd;
  }

  return proposed.cmd.replace(
    new RegExp(`\\b${proposed.port}\\b`),
    String(port)
  );
}

/** The command a process runs on: the reader's, else the agent's on today's port, else the manager's own. */
export function commandOf(draft: ProcessDraft): string {
  if (draft.ownCmd) {
    return draft.cmd;
  }

  const port = mainPort(draft);

  return (
    proposedCommand(draft.proposed, port) ?? startCommand(draft.pkgmgr, port)
  );
}

/** Every port the other processes of the draft hold: what a row of this one is weighed against. */
export function heldAround(
  processes: readonly ProcessDraft[],
  index: number,
  held: Held
): Held {
  const others = processes.filter((_process, at) => at !== index);

  return {
    hostnames: held.hostnames,
    ports: [
      ...held.ports,
      ...others.flatMap((other) => other.rows.map((row) => row.port)),
    ],
  };
}

/** A process added by hand: the first usual id nobody carries, one row on a free port. */
export function addedProcess(
  processes: readonly ProcessDraft[],
  held: Held,
  publish: boolean
): ProcessDraft {
  const ids = new Set(processes.map((current) => current.id));
  const id =
    USUAL_IDS.find((usual) => !ids.has(usual)) ??
    `process-${processes.length + 1}`;
  const taken = heldAround(processes, -1, held).ports;
  const from = Math.max(...taken, FIRST_PORT - 1) + 1;

  return draftOf({
    id,
    rows: [firstRow(freePort(taken, from), publish)],
  });
}

function fromDetected(
  detected: DetectedProcess,
  publish: boolean
): ProcessDraft {
  const rows =
    detected.routes && detected.routes.length > 0
      ? rowsFromDetection(detected.routes, publish)
      : [firstRow(detected.port_hint ?? FIRST_PORT, publish)];

  return draftOf({
    dir: detected.dir === PROJECT_ROOT_DIR ? "" : detected.dir,
    host: detected.host_hint ?? HOST,
    id: detected.id,
    install: "",
    pkgmgr: detected.pkgmgr,
    proposed: {
      ...(detected.cmd ? { cmd: detected.cmd } : {}),
      ...(detected.port_hint ? { port: detected.port_hint } : {}),
    },
    rows,
  });
}

/** The processes the agent read off the source, in its order, all published when the server can. */
export function processesFromDetection(
  result: ProjectDetectResult,
  publish: boolean
): ProcessDraft[] {
  return result.processes.map((detected) => fromDetected(detected, publish));
}

/** The processes of a declared project, as the configuration screen opens them: nothing proposed, everything the reader's. */
export function processesFromProject(project: Project): ProcessDraft[] {
  return project.processes.map((declared) =>
    draftOf({
      cmd: declared.cmd,
      dir: declared.dir === PROJECT_ROOT_DIR ? "" : declared.dir,
      host: declared.host,
      id: declared.id,
      install: declared.install ?? "",
      ownCmd: true,
      pkgmgr: declared.pkgmgr,
      rows: rowsFromProcess(declared),
    })
  );
}

/**
 * Every process refreshed: its command follows its port unless the reader
 * took it over, and every row's name on the web follows the project's name.
 */
export function followProcesses(
  processes: readonly ProcessDraft[],
  name: string,
  exposure: boolean,
  taken: readonly string[]
): ProcessDraft[] {
  const claimed = [...taken];

  return processes.map((current, index) => {
    const rows = followName(current.rows, name, exposure, claimed, index === 0);

    for (const row of rows) {
      if (row.publish && row.web) {
        claimed.push(row.web);
      }
    }

    return { ...current, cmd: commandOf({ ...current, rows }), rows };
  });
}

export function validDir(dir: string): boolean {
  return !(dir.startsWith("/") || DIR_ESCAPES.test(dir));
}

/** Why the agent would refuse a process, weighed before it is asked. */
export function processProblem(
  processes: readonly ProcessDraft[],
  index: number
): ProcessProblem | null {
  const current = processes[index];

  if (!current) {
    return null;
  }

  if (!validLabel(current.id)) {
    return "id";
  }

  if (processes.some((other, at) => at !== index && other.id === current.id)) {
    return "idTaken";
  }

  if (!validDir(current.dir.trim())) {
    return "dir";
  }

  if (current.cmd.trim().length === 0) {
    return "cmd";
  }

  return null;
}

/** Why each row of a process would be refused, in the order of the rows. */
export function rowProblems(
  processes: readonly ProcessDraft[],
  index: number,
  held: Held,
  exposure: boolean
): (RowProblem | null)[] {
  const current = processes[index];

  if (!current) {
    return [];
  }

  const around = heldAround(processes, index, held);

  return current.rows.map((_row, at) =>
    rowProblem(current.rows, at, around, exposure)
  );
}

export function processesReady(
  processes: readonly ProcessDraft[],
  held: Held,
  exposure: boolean
): boolean {
  return (
    processes.length > 0 &&
    processes.every(
      (current, index) =>
        processProblem(processes, index) === null &&
        rowsReady(current.rows, heldAround(processes, index, held), exposure)
    )
  );
}

function dirOf(draft: ProcessDraft): string {
  const dir = draft.dir.trim();

  return dir.length > 0 ? dir : PROJECT_ROOT_DIR;
}

/** The processes `project.add` takes. */
export function processRequests(
  processes: readonly ProcessDraft[],
  exposure: boolean
): ProcessRegistration[] {
  return processes.map((current) => {
    const install = current.install.trim();

    return {
      cmd: current.cmd.trim(),
      dir: dirOf(current),
      host: current.host as ProcessRegistration["host"],
      id: current.id,
      pkgmgr: current.pkgmgr,
      port: mainPort(current),
      routes: routeRequests(current.rows, exposure),
      ...(install ? { install } : {}),
    };
  });
}

/**
 * The processes `project.update` takes: the whole list, each with its whole
 * list of routes. The install line travels even when empty, because empty is
 * an answer: the command goes back to the package manager.
 */
export function processPatches(
  processes: readonly ProcessDraft[],
  exposure: boolean
): ProcessPatch[] {
  return processes.map((current) => ({
    cmd: current.cmd.trim(),
    dir: dirOf(current),
    host: current.host as ProcessPatch["host"],
    id: current.id,
    install: current.install.trim(),
    pkgmgr: current.pkgmgr,
    port: mainPort(current),
    routes: routePatches(current.rows, exposure),
  }));
}

/** The subdomains the processes ask to publish: what the tunnel has to carry once the project is added. */
export function publishedSubdomains(
  processes: readonly ProcessDraft[],
  exposure: boolean
): string[] {
  return processRequests(processes, exposure).flatMap((request) =>
    request.routes.flatMap((route) => route.subdomain ?? [])
  );
}
