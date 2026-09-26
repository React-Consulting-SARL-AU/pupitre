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
  shaped,
  started,
  stepOf,
} from "../lib/module-progress";
import { useNavigation } from "./navigation";
import { useTransfers } from "./transfers";
import { useTunnel } from "./tunnel";

const GALLERY_MODULE = "ai.browser";
const GALLERY_SUBDOMAIN = "subdomain";
const GALLERY_ROUTE = "shots";

/** Holds credential labels only: values stay in the main process, revealed one at a time. */
export type DetailState =
  | { status: "idle" }
  | { status: "reading"; moduleId: string }
  | { status: "ready"; moduleId: string; detail: ServiceDetail }
  | { status: "failed"; moduleId: string; error: AgentError };

export type ConfigState =
  | { status: "idle" }
  | { status: "reading"; moduleId: string }
  | {
      status: "ready";
      moduleId: string;
      held: readonly string[];
      answered: Record<string, unknown>;
      /** `answered` completed by the manifest's defaults. */
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

export interface DatabaseOutcome {
  kind: "dump" | "import";
  lines: string[];
  bytes?: number;
}

export type ServiceControl =
  | "service.start"
  | "service.stop"
  | "service.restart";

export type DumpsState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; dumps: FileEntry[] }
  | { status: "failed"; error: AgentError };

/** Dumps travel on their own transfer, not the agent channel; `db.import` runs once it is done. */
export interface PendingImport {
  transferId: string;
  name: string;
  serverId: string;
  moduleId: string;
}

/** Relative to the agent's root. */
export const DUMPS_DIR = "dumps";

interface ServicesStore {
  detail: DetailState;
  config: ConfigState;
  manifest: Manifest | null;
  values: Record<string, unknown>;
  secrets: SecretMarks;
  touched: readonly string[];
  attempted: boolean;
  /** Server-side refusals (e.g. a port in use), cleared when their field changes. */
  refused: readonly FieldProblem[];
  apply: ApplyState;
  secretsDropped: boolean;
  removal: RemovalState;
  steps: ModuleProgress[];
  pollMs: number;
  database: DatabaseOutcome | null;
  dumps: DumpsState;
  pendingImports: PendingImport[];
  busy: string | null;
  problem: AgentError | null;

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
  problems: () => FieldProblem[];
  shown: () => FieldProblem[];
  dirty: () => boolean;
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
  readDumps: (serverId: string) => Promise<void>;
  restoreDump: (
    serverId: string,
    moduleId: string,
    fileName: string
  ) => Promise<void>;
  removeDump: (serverId: string, fileName: string) => Promise<void>;
  shell: (serverId: string, moduleId: string) => Promise<void>;
  downloadDump: (serverId: string) => Promise<void>;
  importFromComputer: (serverId: string, moduleId: string) => Promise<void>;
  announce: (error: AgentError | null) => void;
  forget: () => void;
}

const REPORT_POLL_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  // The gallery is served beside the projects, under a name no project holds.
  async function galleryNames(serverId: string): Promise<string[]> {
    await useTunnel.getState().read(serverId);

    const { tunnel } = useTunnel.getState();

    if (tunnel.status !== "ready" || tunnel.tunnel.provider !== "cloudflare") {
      return [];
    }

    return tunnel.tunnel.routes
      .filter((route) => route.project === GALLERY_ROUTE)
      .map((route) => route.hostname);
  }

  // null when the change moves no public name: neither the exposure's domain nor the gallery's subdomain.
  async function publishedNames(
    serverId: string,
    moduleId: string,
    values: Record<string, unknown>
  ): Promise<string[] | null> {
    const { config } = get();
    const answered = config.status === "ready" ? config.answered : {};

    if (moduleId === GALLERY_MODULE) {
      const kept = answered[GALLERY_SUBDOMAIN] ?? "";

      return kept === (values[GALLERY_SUBDOMAIN] ?? "")
        ? null
        : await galleryNames(serverId);
    }

    const kept = config.status === "ready" ? answered.domain : values.domain;

    if (!moduleId.startsWith("exposure.") || kept === values.domain) {
      return null;
    }

    const listed = await window.pupitre.listProjects(serverId);

    if (!listed.ok) {
      return [];
    }

    const projects = listed.result.projects.flatMap((project) =>
      project.processes.flatMap((process) =>
        process.routes.flatMap((route) => route.hostname ?? [])
      )
    );

    return [...projects, ...(await galleryNames(serverId))];
  }

  // The agent moves the routes; the DNS records are the app's to release and rewrite.
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

  async function followReport(
    serverId: string,
    moduleId: string
  ): Promise<void> {
    for (;;) {
      const answer = await window.pupitre.installReport(serverId);

      if (!answer.ok) {
        set({ apply: { error: answer.error, moduleId, status: "failed" } });

        return;
      }

      const report = answer.result.modules.find((one) => one.id === moduleId);

      set((state) => ({
        steps: report
          ? [
              shaped(
                moduleId,
                report.steps.map((step) => ({
                  ms: step.ms,
                  status: step.status,
                  step: step.step,
                  ...(step.replay ? { replay: step.replay } : {}),
                  ...(step.message ? { message: step.message } : {}),
                }))
              ),
            ]
          : state.steps,
      }));

      if (answer.result.finished_at !== "") {
        set({
          apply: {
            moduleId,
            result: {
              failed: answer.result.failed,
              report_path: answer.result.report_path,
              warned: answer.result.warned,
            },
            status: "done",
          },
        });

        return;
      }

      await delay(get().pollMs);
    }
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

    // An older agent kept no values on record: fall back to the manifest's defaults.
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

  // A refusal naming its fields is shown on those fields, not announced as a failure.
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

  // An agent too old to check answers nothing: the form's own checks then stand.
  async function serverRefusals(
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
    pollMs: REPORT_POLL_MS,
    problem: null,
    refused: [],
    removal: { status: "idle" },
    secrets: {},
    secretsDropped: false,
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
        secretsDropped: false,
        steps: [],
      });

      await readDetail(serverId, moduleId);

      if (!manifest) {
        return;
      }

      await read(serverId, moduleId, defaultsOf(manifest));

      // A module installed for later never got its generated passwords: make them now.
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
              secretsDropped: false,
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
          ? { problem: null, secrets: answer.result, secretsDropped: false }
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

    // An untyped secret is not sent: the agent keeps the one it holds.
    async reconfigure(serverId, moduleId) {
      set({ attempted: true, problem: null });

      if (get().problems().length > 0) {
        return;
      }

      set({ apply: { moduleId, status: "running" }, steps: [] });

      const refused = await serverRefusals(serverId, moduleId, get().values);

      if (refused.length > 0) {
        set({ apply: { status: "idle" }, refused });

        return;
      }

      set({ steps: started([moduleId]) });

      const before = await publishedNames(serverId, moduleId, get().values);
      let vaultHeld = false;

      const answer = await window.pupitre.startInstall(
        serverId,
        [moduleId],
        // Sent whole: the agent replaces a module's configuration, it never merges.
        { [moduleId]: { ...get().values } },
        (update) => {
          if (update.kind === "event") {
            note(update.event);
          }

          if (update.kind === "secrets") {
            vaultHeld = update.held;
          }
        }
      );

      // Busy means another run is under way: follow it on the report instead of failing.
      if (!answer.ok && answer.error.code === "busy") {
        await followReport(serverId, moduleId);

        return;
      }

      const named =
        !answer.ok && answer.error.remedy?.code === "invalid_fields"
          ? answer.error.remedy.problems
          : [];
      const kept = vaultHeld;
      const typed = Object.values(get().secrets[moduleId] ?? {}).some(
        (mark) => mark.filled
      );

      set((state) => ({
        apply: outcomeOf(answer, moduleId, named.length > 0),
        refused: named,
        secrets: kept ? state.secrets : {},
        secretsDropped: !(answer.ok || kept) && typed,
      }));

      // Not open(): that would reset the steps and verdict the panel keeps.
      if (answer.ok) {
        await readDetail(serverId, moduleId);
        await read(serverId, moduleId, get().values);
        await followDomain(serverId, before);
      }
    },

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

    // The URL becomes a masked credential, so it is read back through the detail.
    async connectionUrl(serverId, moduleId) {
      set({ busy: "db.url", problem: null });

      const answer = await window.pupitre.databaseUrl(serverId, moduleId);

      if (!answer.ok) {
        set({ busy: null, problem: answer.error });

        return;
      }

      set({ busy: null });

      await readDetail(serverId, moduleId);
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

    // The agent answers the state systemd settled on, not the one requested.
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

    // The renderer only gets an id: the shell command stays in the main process.
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
        secretsDropped: false,
        steps: [],
        touched: [],
        values: {},
      });
    },
  };
});
