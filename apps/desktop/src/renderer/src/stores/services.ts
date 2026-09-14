import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  FileEntry,
  FsListResult,
  FsRemoveResult,
} from "@pupitre/shared/agent-protocol/files";
import type {
  InstallResult,
  ModuleConfigResult,
} from "@pupitre/shared/agent-protocol/install";
import type {
  DbDumpResult,
  DbImportResult,
} from "@pupitre/shared/agent-protocol/secrets";
import type { ServiceStatusResult } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import {
  type FieldProblem,
  validateConfig,
} from "@pupitre/shared/catalog/validate";
import type { AgentError, AgentResponse } from "@shared/agent";
import { itemKey, type SecretMarks } from "@shared/secrets";
import { databaseEngineOf, type ServiceDetail } from "@shared/services";
import { settled } from "@shared/transfers";
import { create } from "zustand";
import { agentCall as call } from "../lib/agent-call";
import { defaultsOf, generatedKeysOf } from "../lib/catalog-selection";
import { databaseOfDump } from "../lib/dumps";
import { dirnameOf, under, within } from "../lib/files";
import {
  type ModuleProgress,
  record,
  started,
  stepOf,
} from "../lib/module-progress";
import { useNavigation } from "./navigation";
import { useTransfers } from "./transfers";
import { useTunnel } from "./tunnel";

/**
 * One service of the machine, as the screen works with it day to day.
 *
 * The state, the version and the port are the agent's. The credentials are not
 * here at all: this store holds their labels, and asks the main process for one
 * value at a time when the reader clicks — which is why the whole store can be
 * printed, dumped or inspected without a password appearing in it.
 */

export type DetailState =
  | { status: "idle" }
  | { status: "reading"; moduleId: string }
  | { status: "ready"; moduleId: string; detail: ServiceDetail }
  | { status: "failed"; moduleId: string; error: AgentError };

/**
 * What the agent kept from the last request for this module, and what the
 * reader changed since. Secrets are here by name only: their value goes to the
 * main process and does not come back.
 */
export type ConfigState =
  | { status: "idle" }
  | { status: "reading"; moduleId: string }
  | {
      status: "ready";
      moduleId: string;
      held: readonly string[];
      /** The values as the agent answered them, before the form touched any. */
      answered: Record<string, unknown>;
      /** What the form opened on: the answers, completed by the manifest's defaults. */
      baseline: Record<string, unknown>;
    }
  | { status: "failed"; moduleId: string; error: AgentError };

export type ApplyState =
  | { status: "idle" }
  | { status: "running"; moduleId: string }
  | { status: "done"; moduleId: string; result: InstallResult }
  | { status: "failed"; moduleId: string; error: AgentError };

export type RemovalState =
  | { status: "idle" }
  | { status: "running"; moduleId: string }
  | { status: "done"; moduleId: string; failed: readonly string[] }
  | { status: "failed"; moduleId: string; error: AgentError };

/** What the last database gesture produced, in the agent's own words. */
export interface DatabaseOutcome {
  kind: "dump" | "import";
  lines: string[];
  bytes?: number;
}

/** The unit's three gestures, as the protocol names them. */
export type ServiceControl =
  | "service.start"
  | "service.stop"
  | "service.restart";

/** The dumps present in the server's folder, as `fs.list` describes them. */
export type DumpsState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; dumps: FileEntry[] }
  | { status: "failed"; error: AgentError };

/**
 * A dump on its way up from this computer, imported the moment it lands.
 *
 * The file rides its own transfer, outside the agent's channel — a dump of
 * several gigabytes is the reason transfers exist — and `db.import` is asked
 * by name once the transfer says done.
 */
export interface PendingImport {
  transferId: string;
  name: string;
  serverId: string;
  moduleId: string;
}

/** The folder under the agent's root where `db.dump` writes and `db.import` reads. */
export const DUMPS_DIR = "dumps";

interface ServicesStore {
  detail: DetailState;
  config: ConfigState;
  /** The manifest the form is drawn from, when the server declared one. */
  manifest: Manifest | null;
  values: Record<string, unknown>;
  secrets: SecretMarks;
  /** The fields the reader answered since the form opened: the only ones that say what is wrong with them before an apply. */
  touched: readonly string[];
  /** An apply was asked for: every problem is shown from then on. */
  attempted: boolean;
  /** What only the server could refuse — a port another program holds — kept on its field until that field changes. */
  refused: readonly FieldProblem[];
  apply: ApplyState;
  removal: RemovalState;
  steps: ModuleProgress[];
  database: DatabaseOutcome | null;
  dumps: DumpsState;
  pendingImports: PendingImport[];
  busy: string | null;
  problem: AgentError | null;

  /**
   * Opens the panel: the state, and, given the manifest, the form under it —
   * with the secrets a module left unconfigured still owes made on the way.
   */
  open: (
    serverId: string,
    moduleId: string,
    manifest?: Manifest | null
  ) => Promise<void>;
  readConfig: (
    serverId: string,
    moduleId: string,
    defaults?: Record<string, unknown>
  ) => Promise<void>;
  setValue: (key: string, value: unknown) => void;
  /** What the form refuses by the rules of the manifest, and what the server refused. */
  problems: () => FieldProblem[];
  /** The problems the form is allowed to show: on a field answered since it opened, or all once an apply was asked for. */
  shown: () => FieldProblem[];
  /** Whether the form holds anything the server does not: a changed value, a typed or generated secret. */
  dirty: () => boolean;
  /** Puts the form back to what the server holds and drops the secrets typed since. */
  discard: (serverId: string) => Promise<void>;
  setSecret: (
    serverId: string,
    moduleId: string,
    key: string,
    value: string
  ) => Promise<void>;
  generate: (serverId: string, moduleId: string, key: string) => Promise<void>;
  revealSecret: (
    serverId: string,
    moduleId: string,
    key: string
  ) => Promise<string | null>;
  reconfigure: (serverId: string, moduleId: string) => Promise<void>;
  close: (serverId: string) => Promise<void>;
  reveal: (
    serverId: string,
    moduleId: string,
    label: string
  ) => Promise<string | null>;
  copy: (serverId: string, moduleId: string, label: string) => Promise<boolean>;
  connectionUrl: (serverId: string, moduleId: string) => Promise<void>;
  remove: (serverId: string, moduleId: string) => Promise<void>;
  /** Starts, stops or restarts the unit; what comes back is the state it is in. */
  control: (
    serverId: string,
    moduleId: string,
    cmd: ServiceControl
  ) => Promise<void>;
  dump: (serverId: string, moduleId: string, name?: string) => Promise<void>;
  importDumps: (
    serverId: string,
    moduleId: string,
    name?: string
  ) => Promise<void>;
  /** The dumps on the server, listed from the folder `db.dump` writes to. */
  readDumps: (serverId: string) => Promise<void>;
  /** Feeds one dump, chosen by its file, to the database its name says. */
  restoreDump: (
    serverId: string,
    moduleId: string,
    fileName: string
  ) => Promise<void>;
  removeDump: (serverId: string, fileName: string) => Promise<void>;
  /** Opens the database's shell in a terminal tab the main process commands. */
  shell: (serverId: string, moduleId: string) => Promise<void>;
  /** Brings the last dump to this computer, on its own transfer. */
  downloadDump: (serverId: string) => Promise<void>;
  /** Sends dumps chosen on this computer to the server, then imports each one. */
  importFromComputer: (serverId: string, moduleId: string) => Promise<void>;
  announce: (error: AgentError | null) => void;
  forget: () => void;
}

function outsideRoot(): AgentError {
  return {
    code: "bad_request",
    message: "",
    phrase: { id: "files.outsideRoot" },
  };
}

function engineParams(
  moduleId: string,
  name?: string
): { engine: string; name?: string } | null {
  const engine = databaseEngineOf(moduleId);

  return engine ? { engine, ...(name ? { name } : {}) } : null;
}

export const useServices = create<ServicesStore>((set, get) => {
  /** The dump's path as the agent's `fs.*` names it: under the root the agent holds. */
  async function relativeDump(
    serverId: string,
    absolute: string
  ): Promise<string | null> {
    const named = await window.pupitre.completions(serverId);

    if (!named.ok) {
      set({ problem: named.error });

      return null;
    }

    return within(dirnameOf(named.result.root), absolute);
  }

  useTransfers.subscribe((state) => {
    const { pendingImports } = get();

    if (pendingImports.length === 0) {
      return;
    }

    const kept: PendingImport[] = [];

    for (const waiting of pendingImports) {
      const transfer = state.transfers.find(
        (one) => one.id === waiting.transferId
      );

      if (transfer?.status === "done") {
        get().importDumps(waiting.serverId, waiting.moduleId, waiting.name);
      } else if (transfer && !settled(transfer)) {
        kept.push(waiting);
      }
    }

    if (kept.length !== pendingImports.length) {
      set({ pendingImports: kept });
    }
  });

  function note(event: Event): void {
    const step = stepOf(event);

    if (step) {
      set((state) => ({
        steps: record(state.steps, step.module, step.entry),
      }));
    }
  }

  async function database<T>(
    serverId: string,
    moduleId: string,
    cmd: "db.dump" | "db.import",
    kind: DatabaseOutcome["kind"],
    name: string | undefined,
    shape: (result: T) => Omit<DatabaseOutcome, "kind">
  ): Promise<void> {
    const params = engineParams(moduleId, name);

    if (!params) {
      return;
    }

    set({ busy: cmd, database: null, problem: null });

    const answer = await call<T>(serverId, cmd, params);

    set({
      busy: null,
      database: answer.ok ? { kind, ...shape(answer.result) } : null,
      problem: answer.ok ? null : answer.error,
    });
  }

  async function readDumps(serverId: string): Promise<void> {
    set((state) =>
      state.dumps.status === "ready"
        ? state
        : { ...state, dumps: { status: "reading" } }
    );

    const answer = await call<FsListResult>(serverId, "fs.list", {
      path: DUMPS_DIR,
    });

    set({
      dumps: answer.ok
        ? {
            dumps: answer.result.entries.filter(
              (entry) => entry.kind === "file"
            ),
            status: "ready",
          }
        : { error: answer.error, status: "failed" },
    });
  }

  /**
   * The configuration the agent kept, re-read when the panel opens.
   *
   * `values` is what the form will send back in `install`: it always goes
   * whole, because the agent replaces a module's configuration rather than
   * merging it field by field.
   */
  /**
   * The names the projects answer to under the domain an exposure is about to
   * leave: nothing when the module is not an exposure, or keeps its domain.
   */
  async function publishedNames(
    serverId: string,
    moduleId: string,
    values: Record<string, unknown>
  ): Promise<string[] | null> {
    const { config } = get();
    const kept =
      config.status === "ready" ? config.answered.domain : values.domain;

    if (!moduleId.startsWith("exposure.") || kept === values.domain) {
      return null;
    }

    const listed = await window.pupitre.listProjects(serverId);

    if (!listed.ok) {
      return [];
    }

    return listed.result.projects.flatMap((project) =>
      project.processes.flatMap((process) =>
        process.routes.flatMap((route) => route.hostname ?? [])
      )
    );
  }

  /**
   * The agent moved every name under the new domain; the records are the
   * app's to move: the ones of before go — only those it wrote — and the ones
   * of now are written from what the tunnel declares.
   */
  async function followDomain(
    serverId: string,
    before: string[] | null
  ): Promise<void> {
    if (before === null) {
      return;
    }

    if (before.length > 0) {
      const released = await window.pupitre.releaseTunnelRecords(
        serverId,
        before
      );

      if (!released.ok) {
        set({ problem: released.error });
      }
    }

    await useTunnel.getState().sync(serverId);
  }

  async function readDetail(serverId: string, moduleId: string): Promise<void> {
    const answer = await window.pupitre.serviceDetail(serverId, moduleId);

    set({
      detail: answer.ok
        ? { detail: answer.result, moduleId, status: "ready" }
        : { error: answer.error, moduleId, status: "failed" },
    });
  }

  async function read(
    serverId: string,
    moduleId: string,
    defaults: Record<string, unknown> = {}
  ): Promise<void> {
    set({
      attempted: false,
      config: { moduleId, status: "reading" },
      refused: [],
      secrets: {},
      touched: [],
      values: {},
    });

    const answer = await call<ModuleConfigResult>(serverId, "module.config", {
      id: moduleId,
    });

    if (!answer.ok) {
      set({ config: { error: answer.error, moduleId, status: "failed" } });

      return;
    }

    // A module installed by an older agent kept nothing on record: the form
    // then shows the manifest's defaults, the values the agent would apply,
    // instead of empty fields.
    const baseline = { ...defaults, ...answer.result.values };

    set({
      config: {
        answered: answer.result.values,
        baseline,
        held: answer.result.secrets,
        moduleId,
        status: "ready",
      },
      values: baseline,
    });
  }

  /** A refusal that named its fields is not a failure to announce: the form says it, on the fields. */
  function outcomeOf(
    answer: AgentResponse<InstallResult>,
    moduleId: string,
    named: boolean
  ): ApplyState {
    if (answer.ok) {
      return { moduleId, result: answer.result, status: "done" };
    }

    return named
      ? { status: "idle" }
      : { error: answer.error, moduleId, status: "failed" };
  }

  /** How many values a secret field holds: typed or generated here, or kept by the server. */
  function heldSecrets(moduleId: string): (id: string, key: string) => number {
    return (_id, key) => {
      const { config, secrets } = get();
      const marks = secrets[moduleId] ?? {};
      const kept = config.status === "ready" ? config.held : [];

      if (marks[key]?.filled || kept.includes(key)) {
        return 1;
      }

      let filled = 0;
      while (marks[itemKey(key, filled)]?.filled) {
        filled += 1;
      }

      return filled;
    };
  }

  function same(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  /**
   * The server's own verdict on the values, asked before they are applied: a
   * port another program listens on is something only the machine knows. An
   * agent too old to answer says so, and the apply goes on with what the form
   * checked itself.
   */
  async function weigh(
    serverId: string,
    moduleId: string,
    values: Record<string, unknown>
  ): Promise<FieldProblem[]> {
    const answer = await window.pupitre
      .checkInstall(serverId, [moduleId], { [moduleId]: values }, [])
      .catch(() => null);

    return answer?.ok ? answer.result.problems : [];
  }

  return {
    apply: { status: "idle" },
    attempted: false,
    busy: null,
    config: { status: "idle" },
    database: null,
    detail: { status: "idle" },
    dumps: { status: "idle" },
    manifest: null,
    pendingImports: [],
    problem: null,
    refused: [],
    removal: { status: "idle" },
    secrets: {},
    steps: [],
    touched: [],
    values: {},

    async open(serverId, moduleId, manifest = null) {
      set({
        apply: { status: "idle" },
        database: null,
        detail: { moduleId, status: "reading" },
        dumps: { status: "idle" },
        manifest,
        problem: null,
        removal: { status: "idle" },
        steps: [],
      });

      await readDetail(serverId, moduleId);

      if (!manifest) {
        return;
      }

      await read(serverId, moduleId, defaultsOf(manifest));

      // A module put on the machine for later was never given the passwords
      // its manifest says to generate: they are made now, as the catalogue
      // would have, so that applying the form is all that finishes it.
      const { detail, config } = get();
      const owed =
        detail.status === "ready" && !detail.detail.configured
          ? generatedKeysOf(manifest).filter(
              (key) => !(config.status === "ready" && config.held.includes(key))
            )
          : [];

      for (const key of owed) {
        await get().generate(serverId, moduleId, key);
      }
    },

    readConfig: read,

    setValue(key, value) {
      set((state) => ({
        refused: state.refused.filter((problem) => problem.field !== key),
        touched: state.touched.includes(key)
          ? state.touched
          : [...state.touched, key],
        values: { ...state.values, [key]: value },
      }));
    },

    problems() {
      const { manifest, values, refused } = get();

      if (!manifest) {
        return [...refused];
      }

      return [
        ...validateConfig(
          [manifest],
          [manifest.id],
          { [manifest.id]: values },
          heldSecrets(manifest.id),
          { skipManaged: true }
        ),
        ...refused,
      ];
    },

    shown() {
      const { attempted, touched, refused } = get();

      return get()
        .problems()
        .filter(
          (problem) =>
            attempted ||
            touched.includes(problem.field) ||
            refused.includes(problem)
        );
    },

    dirty() {
      const { config, manifest, values, secrets } = get();

      if (config.status !== "ready") {
        return false;
      }

      const marks = manifest ? Object.values(secrets[manifest.id] ?? {}) : [];
      if (marks.some((mark) => mark.filled)) {
        return true;
      }

      const keys = new Set([
        ...Object.keys(config.baseline),
        ...Object.keys(values),
      ]);

      return [...keys].some((key) => !same(values[key], config.baseline[key]));
    },

    async discard(serverId) {
      const { config } = get();

      await window.pupitre.forgetInstallSecrets(serverId);

      set({
        attempted: false,
        refused: [],
        secrets: {},
        touched: [],
        values: config.status === "ready" ? config.baseline : {},
      });
    },

    async setSecret(serverId, moduleId, key, value) {
      const answer = await window.pupitre.setInstallSecret(
        serverId,
        moduleId,
        key,
        value
      );

      set((state) =>
        answer.ok
          ? {
              problem: null,
              refused: state.refused.filter((problem) => problem.field !== key),
              secrets: answer.result,
              touched: state.touched.includes(key)
                ? state.touched
                : [...state.touched, key],
            }
          : { problem: answer.error }
      );
    },

    async generate(serverId, moduleId, key) {
      const answer = await window.pupitre.generateInstallSecret(
        serverId,
        moduleId,
        key
      );

      set(
        answer.ok
          ? { problem: null, secrets: answer.result }
          : { problem: answer.error }
      );
    },

    async revealSecret(serverId, moduleId, key) {
      const answer = await window.pupitre.revealInstallSecret(
        serverId,
        moduleId,
        key
      );
      set({ secrets: answer.marks });

      return answer.value;
    },

    /**
     * The form sent back to the agent: the same `install`, for this one module.
     *
     * A retyped secret leaves the main process's vault on the secret stream;
     * a secret left untyped isn't sent at all, and the agent keeps the one it
     * already holds.
     */
    async reconfigure(serverId, moduleId) {
      set({ attempted: true, problem: null });

      if (get().problems().length > 0) {
        return;
      }

      set({ apply: { moduleId, status: "running" }, steps: [] });

      const refused = await weigh(serverId, moduleId, get().values);
      if (refused.length > 0) {
        set({ apply: { status: "idle" }, refused });

        return;
      }

      set({ steps: started([moduleId]) });

      const before = await publishedNames(serverId, moduleId, get().values);

      const answer = await window.pupitre.startInstall(
        serverId,
        [moduleId],
        { [moduleId]: { ...get().values } },
        (update) => {
          if (update.kind === "event") {
            note(update.event);
          }
        }
      );

      // A configuration the agent refused names its fields: the form marks
      // them, as it would have had the check caught them first.
      const named =
        !answer.ok && answer.error.remedy?.code === "invalid_fields"
          ? answer.error.remedy.problems
          : [];

      set({
        apply: outcomeOf(answer, moduleId, named.length > 0),
        refused: named,
        secrets: {},
      });

      // The panel keeps its steps and verdict: only the service's state and
      // what the agent now holds are re-read.
      if (answer.ok) {
        await readDetail(serverId, moduleId);
        await read(serverId, moduleId, get().values);
        await followDomain(serverId, before);
      }
    },

    /** Closing the panel is what tells the main process to drop the values. */
    async close(serverId) {
      const { detail } = get();

      if (detail.status !== "idle") {
        await window.pupitre.forgetCredentials(serverId, detail.moduleId);
      }

      await window.pupitre.forgetInstallSecrets(serverId);
      get().forget();
    },

    reveal(serverId, moduleId, label) {
      return window.pupitre.revealCredential(serverId, moduleId, label);
    },

    copy(serverId, moduleId, label) {
      return window.pupitre.copyCredential(serverId, moduleId, label);
    },

    /**
     * The connection string joins the credentials rather than the screen: it
     * carries what opens the database, and is masked like the rest.
     */
    async connectionUrl(serverId, moduleId) {
      set({ busy: "db.url", problem: null });

      const answer = await window.pupitre.databaseUrl(serverId, moduleId);

      if (!answer.ok) {
        set({ busy: null, problem: answer.error });

        return;
      }

      set({ busy: null });
      await get().open(serverId, moduleId);
    },

    async remove(serverId, moduleId) {
      set({
        problem: null,
        removal: { moduleId, status: "running" },
        steps: started([moduleId]),
      });

      const answer = (await window.pupitre.agentStream(
        serverId,
        "uninstall",
        { modules: [moduleId] },
        note
      )) as AgentResponse<{ failed: string[] }>;

      set({
        removal: answer.ok
          ? { failed: answer.result.failed, moduleId, status: "done" }
          : { error: answer.error, moduleId, status: "failed" },
      });
    },

    /**
     * The answer is the state, not the intention: the agent waits for systemd's
     * verdict and answers what `service.status` would. The credentials it does
     * not carry are the ones already on the page.
     */
    async control(serverId, moduleId, cmd) {
      set({ busy: cmd, problem: null });

      const answer = await call<ServiceStatusResult>(serverId, cmd, {
        id: moduleId,
      });

      set((state) => ({
        busy: null,
        detail:
          answer.ok &&
          state.detail.status === "ready" &&
          state.detail.moduleId === moduleId
            ? {
                ...state.detail,
                detail: {
                  ...state.detail.detail,
                  state: answer.result.state,
                  ...(answer.result.version === undefined
                    ? {}
                    : { version: answer.result.version }),
                  ...(answer.result.port === undefined
                    ? {}
                    : { port: answer.result.port }),
                },
              }
            : state.detail,
        problem: answer.ok ? null : answer.error,
      }));
    },

    async dump(serverId, moduleId, name) {
      await database<DbDumpResult>(
        serverId,
        moduleId,
        "db.dump",
        "dump",
        name,
        (result) => ({ bytes: result.size_bytes, lines: [result.path] })
      );

      // The list, when the reader has it open, shows the file that just landed.
      if (get().database?.kind === "dump" && get().dumps.status !== "idle") {
        await readDumps(serverId);
      }
    },

    importDumps(serverId, moduleId, name) {
      return database<DbImportResult>(
        serverId,
        moduleId,
        "db.import",
        "import",
        name === undefined ? undefined : databaseOfDump(name),
        (result) => ({ lines: result.imported })
      );
    },

    readDumps,

    restoreDump(serverId, moduleId, fileName) {
      return get().importDumps(serverId, moduleId, fileName);
    },

    async removeDump(serverId, fileName) {
      set({ busy: "fs.remove", problem: null });

      const answer = await call<FsRemoveResult>(serverId, "fs.remove", {
        path: under(DUMPS_DIR, fileName),
      });

      set({ busy: null, problem: answer.ok ? null : answer.error });

      if (answer.ok) {
        await readDumps(serverId);
      }
    },

    /**
     * The tab is opened on an identifier the main process chose: the command
     * the agent composed waits there, under that identifier, and the terminal
     * that mounts on it runs it without this side ever reading the line.
     */
    async shell(serverId, moduleId) {
      set({ busy: "db.shell", problem: null });

      const answer = await window.pupitre.openDatabaseShell(serverId, moduleId);

      set({ busy: null, problem: answer.ok ? null : answer.error });

      if (!answer.ok) {
        return;
      }

      const { detail } = get();
      const title =
        detail.status === "ready" && detail.moduleId === moduleId
          ? detail.detail.name
          : moduleId;

      useNavigation
        .getState()
        .openTerminal(null, "shell", null, { id: answer.result.id, title });
    },

    async downloadDump(serverId) {
      const { database } = get();
      const absolute =
        database?.kind === "dump" ? database.lines[0] : undefined;

      if (!absolute) {
        return;
      }

      const relative = await relativeDump(serverId, absolute);

      if (relative === null) {
        set({ problem: outsideRoot() });

        return;
      }

      await useTransfers.getState().pickAndDownload(serverId, relative, "file");
    },

    async importFromComputer(serverId, moduleId) {
      if (!engineParams(moduleId)) {
        return;
      }

      const paths = await window.pupitre.pickUploadPaths();
      const started = await useTransfers
        .getState()
        .upload(serverId, DUMPS_DIR, paths);

      if (started.length === 0) {
        return;
      }

      set({
        database: null,
        pendingImports: [
          ...get().pendingImports,
          ...started.map((transfer) => ({
            moduleId,
            name: transfer.name,
            serverId,
            transferId: transfer.id,
          })),
        ],
        problem: null,
      });
    },

    announce(error) {
      set({ problem: error });
    },

    forget() {
      set({
        apply: { status: "idle" },
        attempted: false,
        busy: null,
        config: { status: "idle" },
        database: null,
        detail: { status: "idle" },
        dumps: { status: "idle" },
        manifest: null,
        pendingImports: [],
        problem: null,
        refused: [],
        removal: { status: "idle" },
        secrets: {},
        steps: [],
        touched: [],
        values: {},
      });
    },
  };
});
