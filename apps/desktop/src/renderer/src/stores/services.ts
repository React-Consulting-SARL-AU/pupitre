import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  InstallResult,
  ModuleConfigResult,
} from "@pupitre/shared/agent-protocol/install";
import type {
  DbDumpResult,
  DbImportResult,
  DbShellResult,
} from "@pupitre/shared/agent-protocol/secrets";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { SecretMarks } from "@shared/secrets";
import { databaseEngineOf, type ServiceDetail } from "@shared/services";
import { create } from "zustand";
import {
  type ModuleProgress,
  pending,
  record,
  stepOf,
} from "../lib/module-progress";

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
  | { status: "ready"; moduleId: string; held: readonly string[] }
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
  kind: "dump" | "import" | "shell";
  lines: string[];
  bytes?: number;
}

interface ServicesStore {
  detail: DetailState;
  config: ConfigState;
  values: Record<string, unknown>;
  secrets: SecretMarks;
  apply: ApplyState;
  removal: RemovalState;
  steps: ModuleProgress[];
  database: DatabaseOutcome | null;
  busy: string | null;
  problem: AgentError | null;

  open: (serverId: string, moduleId: string) => Promise<void>;
  readConfig: (
    serverId: string,
    moduleId: string,
    defaults?: Record<string, unknown>
  ) => Promise<void>;
  setValue: (key: string, value: unknown) => void;
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
  dump: (serverId: string, moduleId: string, name?: string) => Promise<void>;
  importDumps: (
    serverId: string,
    moduleId: string,
    name?: string
  ) => Promise<void>;
  shell: (serverId: string, moduleId: string) => Promise<void>;
  announce: (error: AgentError | null) => void;
  forget: () => void;
}

function call<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentCall"]>[1],
  params?: unknown
): Promise<AgentResponse<T>> {
  return window.pupitre.agentCall(serverId, cmd, params) as Promise<
    AgentResponse<T>
  >;
}

function engineParams(
  moduleId: string,
  name?: string
): { engine: string; name?: string } | null {
  const engine = databaseEngineOf(moduleId);

  return engine ? { engine, ...(name ? { name } : {}) } : null;
}

export const useServices = create<ServicesStore>((set, get) => {
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
    cmd: "db.dump" | "db.import" | "db.shell",
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

  /**
   * The configuration the agent kept, re-read when the panel opens.
   *
   * `values` is what the form will send back in `install`: it always goes
   * whole, because the agent replaces a module's configuration rather than
   * merging it field by field.
   */
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
    set({ config: { moduleId, status: "reading" }, secrets: {}, values: {} });

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
    set({
      config: { held: answer.result.secrets, moduleId, status: "ready" },
      values: { ...defaults, ...answer.result.values },
    });
  }

  return {
    apply: { status: "idle" },
    busy: null,
    config: { status: "idle" },
    database: null,
    detail: { status: "idle" },
    problem: null,
    removal: { status: "idle" },
    secrets: {},
    steps: [],
    values: {},

    async open(serverId, moduleId) {
      set({
        apply: { status: "idle" },
        database: null,
        detail: { moduleId, status: "reading" },
        problem: null,
        removal: { status: "idle" },
        steps: [],
      });

      await readDetail(serverId, moduleId);
    },

    readConfig: read,

    setValue(key, value) {
      set((state) => ({ values: { ...state.values, [key]: value } }));
    },

    async setSecret(serverId, moduleId, key, value) {
      const answer = await window.pupitre.setInstallSecret(
        serverId,
        moduleId,
        key,
        value
      );

      set(
        answer.ok
          ? { problem: null, secrets: answer.result }
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
      set({
        apply: { moduleId, status: "running" },
        problem: null,
        steps: pending([moduleId]),
      });

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

      set({
        apply: answer.ok
          ? { moduleId, result: answer.result, status: "done" }
          : { error: answer.error, moduleId, status: "failed" },
        secrets: {},
      });

      // The panel keeps its steps and verdict: only the service's state and
      // what the agent now holds are re-read.
      if (answer.ok) {
        await readDetail(serverId, moduleId);
        await read(serverId, moduleId, get().values);
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
        steps: pending([moduleId]),
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

    dump(serverId, moduleId, name) {
      return database<DbDumpResult>(
        serverId,
        moduleId,
        "db.dump",
        "dump",
        name,
        (result) => ({ bytes: result.size_bytes, lines: [result.path] })
      );
    },

    importDumps(serverId, moduleId, name) {
      return database<DbImportResult>(
        serverId,
        moduleId,
        "db.import",
        "import",
        name,
        (result) => ({ lines: result.imported })
      );
    },

    shell(serverId, moduleId) {
      return database<DbShellResult>(
        serverId,
        moduleId,
        "db.shell",
        "shell",
        undefined,
        (result) => ({ lines: [result.command] })
      );
    },

    announce(error) {
      set({ problem: error });
    },

    forget() {
      set({
        apply: { status: "idle" },
        busy: null,
        config: { status: "idle" },
        database: null,
        detail: { status: "idle" },
        problem: null,
        removal: { status: "idle" },
        secrets: {},
        steps: [],
        values: {},
      });
    },
  };
});
