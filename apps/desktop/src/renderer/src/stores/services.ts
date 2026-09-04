import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  DbDumpResult,
  DbImportResult,
  DbShellResult,
} from "@pupitre/shared/agent-protocol/secrets";
import type { AgentError, AgentResponse } from "@shared/agent";
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
  removal: RemovalState;
  steps: ModuleProgress[];
  database: DatabaseOutcome | null;
  busy: string | null;
  problem: AgentError | null;

  open: (serverId: string, moduleId: string) => Promise<void>;
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

  return {
    busy: null,
    database: null,
    detail: { status: "idle" },
    problem: null,
    removal: { status: "idle" },
    steps: [],

    async open(serverId, moduleId) {
      set({
        database: null,
        detail: { moduleId, status: "reading" },
        problem: null,
        removal: { status: "idle" },
        steps: [],
      });

      const answer = await window.pupitre.serviceDetail(serverId, moduleId);

      set({
        detail: answer.ok
          ? { detail: answer.result, moduleId, status: "ready" }
          : { error: answer.error, moduleId, status: "failed" },
      });
    },

    /** Closing the panel is what tells the main process to drop the values. */
    async close(serverId) {
      const { detail } = get();

      if (detail.status !== "idle") {
        await window.pupitre.forgetCredentials(serverId, detail.moduleId);
      }

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
        busy: null,
        database: null,
        detail: { status: "idle" },
        problem: null,
        removal: { status: "idle" },
        steps: [],
      });
    },
  };
});
