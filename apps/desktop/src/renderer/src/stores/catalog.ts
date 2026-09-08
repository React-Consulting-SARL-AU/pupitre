import type {
  CatalogResult,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { Manifest, Preset } from "@pupitre/shared/catalog";
import type { FieldProblem } from "@pupitre/shared/catalog/validate";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { SecretMarks } from "@shared/secrets";
import { create } from "zustand";
import {
  blocked,
  defaultsOf,
  type FieldGroup,
  type FieldProblemView,
  fieldsOf,
  fromPreset,
  generatedKeysOf,
  type Installed,
  mandatory,
  problemsOf,
  type ResourceWarning,
  resourceWarnings,
  restored,
  toggle as toggleIn,
} from "../lib/catalog-selection";
import { useConnections } from "./connections";
import { probeOf } from "./inspection";

/**
 * What the main process answered about a secret: the marks when it took it,
 * its refusal word for word when it would not.
 */
function marksOf(answer: AgentResponse<SecretMarks>): {
  problem: AgentError | null;
  secrets?: SecretMarks;
} {
  return answer.ok
    ? { problem: null, secrets: answer.result }
    : { problem: answer.error };
}

/**
 * The catalogue screen's state, and none of its secrets.
 *
 * Everything visible here came from the agent: the modules, their fields, their
 * presets. What the reader types into a `secret` field goes straight to the
 * main process and comes back as a mark — filled, generated, revealed — so this
 * store can be serialised, inspected or dumped without leaking anything.
 */

export type CatalogState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "ready"; serverId: string; catalog: CatalogResult }
  | { status: "failed"; serverId: string; error: AgentError };

interface CatalogStore {
  catalog: CatalogState;
  selected: readonly string[];
  values: Record<string, Record<string, unknown>>;
  secrets: SecretMarks;
  /** A refusal the main process opposed to a secret, kept as it worded it. */
  problem: AgentError | null;
  /** What the server already runs, when the screen is opened on top of it. */
  installed: Installed;
  /** The fields answered so far, as `<module>.<key>`. */
  touched: ReadonlySet<string>;
  /** True once an install was asked for and refused: every field speaks then. */
  attempted: boolean;
  /** What the server refused when the app asked it to weigh the configuration. */
  refused: readonly FieldProblemView[];

  load: (serverId: string, installed?: Installed) => Promise<void>;
  /** Puts back the choice an interrupted onboarding had written down. */
  restore: (
    selected: readonly string[],
    values: Record<string, Record<string, unknown>>
  ) => void;
  toggle: (moduleId: string) => void;
  /** `chosen` is the one of the preset's exclusive modules the reader picked. */
  usePreset: (presetId: string, chosen?: string) => void;
  setValue: (moduleId: string, key: string, value: unknown) => void;

  setSecret: (moduleId: string, key: string, value: string) => Promise<void>;
  generate: (moduleId: string, key: string) => Promise<void>;
  reveal: (moduleId: string, key: string) => Promise<string | null>;
  forget: () => Promise<void>;
  /** Waits on the secrets a selection asked the main process to make. */
  settled: () => Promise<void>;

  modules: () => readonly Manifest[];
  groups: () => FieldGroup[];
  /** What the selection gets wrong, by the manifests' own rules. */
  problems: () => FieldProblemView[];
  /** The problems a field is allowed to show: touched, or an install already refused. */
  shown: () => FieldProblemView[];
  /** Notes that a field has been answered, so it may start showing its own refusal. */
  touch: (moduleId: string, key: string) => void;
  /** Notes that an install was asked for and refused: every field speaks now. */
  attempt: () => void;
  /** What the server refused, put back on the fields it names. */
  noteProblems: (problems: readonly FieldProblem[]) => void;
  /** Asks the server to weigh the configuration, and keeps what it refuses. */
  check: (modules: readonly string[]) => Promise<readonly FieldProblemView[]>;
  unreachable: () => Map<string, string>;
  warnings: () => ResourceWarning[];
  config: () => ModuleConfig;
  reset: () => void;
}

const EMPTY: CatalogResult = { modules: [], presets: [] };

function serverOf(state: CatalogState): string | null {
  return state.status === "idle" ? null : state.serverId;
}

function catalogOf(state: CatalogState): CatalogResult {
  return state.status === "ready" ? state.catalog : EMPTY;
}

export const useCatalog = create<CatalogStore>((set, get) => {
  let pending: Promise<unknown> = Promise.resolve();

  /**
   * A secret the manifest says to generate, made in the main process the moment
   * its module is chosen: the reader is never asked to invent a password, and
   * the value never travels to get here.
   */
  function generateFor(added: readonly string[]): void {
    const serverId = serverOf(get().catalog);

    if (!serverId) {
      return;
    }

    for (const module of catalogOf(get().catalog).modules) {
      if (!added.includes(module.id)) {
        continue;
      }

      for (const key of generatedKeysOf(module)) {
        if (get().secrets[module.id]?.[key]?.filled) {
          continue;
        }

        pending = pending.then(async () => {
          set(
            marksOf(
              await window.pupitre.generateInstallSecret(
                serverId,
                module.id,
                key
              )
            )
          );
        });
      }
    }
  }

  function reselect(next: readonly string[]): void {
    const previous = get().selected;
    const added = next.filter((id) => !previous.includes(id));
    const values = { ...get().values };

    for (const module of catalogOf(get().catalog).modules) {
      if (added.includes(module.id)) {
        values[module.id] = { ...defaultsOf(module), ...values[module.id] };
      } else if (!next.includes(module.id)) {
        delete values[module.id];
      }
    }

    set({ selected: next, values });
    generateFor(added);
  }

  return {
    attempted: false,
    catalog: { status: "idle" },
    installed: [],
    problem: null,
    refused: [],
    selected: [],
    touched: new Set<string>(),
    values: {},
    secrets: {},

    async load(serverId, installed = []) {
      set({ catalog: { serverId, status: "loading" }, installed });

      const answer = await window.pupitre.catalog(serverId);

      if (!answer.ok) {
        set({ catalog: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      set({
        attempted: false,
        catalog: { catalog: answer.result, serverId, status: "ready" },
        problem: null,
        refused: [],
        secrets: {},
        selected: [],
        touched: new Set<string>(),
        values: {},
      });

      reselect(mandatory(answer.result.modules, installed));
    },

    /**
     * The selection comes back, the secrets do not: they never left the main
     * process, which forgot them when it closed. Reselecting is what makes the
     * generated ones again, one round trip each, before anything is installed.
     */
    restore(selected, values) {
      if (get().catalog.status !== "ready") {
        return;
      }

      set({ values: { ...values } });
      reselect(restored(get().modules(), selected, get().installed));
    },

    toggle(moduleId) {
      if (get().unreachable().has(moduleId)) {
        return;
      }

      reselect(
        toggleIn(get().modules(), get().selected, moduleId, get().installed)
      );
    },

    usePreset(presetId, chosen) {
      const preset: Preset | undefined = catalogOf(get().catalog).presets.find(
        (candidate) => candidate.id === presetId
      );

      if (!preset) {
        return;
      }

      // A preset that names exclusive modules carries none of them: the one the
      // reader picked joins its list, and the others stay out.
      const asked =
        chosen && preset.choose_one?.includes(chosen as never)
          ? { ...preset, modules: [...preset.modules, chosen as never] }
          : preset;

      reselect(fromPreset(get().modules(), asked, get().installed));
    },

    setValue(moduleId, key, value) {
      set((state) => ({
        // A refusal the server sent about this field was about the old value.
        refused: state.refused.filter(
          (problem) => !(problem.module === moduleId && problem.field === key)
        ),
        values: {
          ...state.values,
          [moduleId]: { ...state.values[moduleId], [key]: value },
        },
      }));

      get().touch(moduleId, key);
    },

    async setSecret(moduleId, key, value) {
      const serverId = serverOf(get().catalog);

      if (!serverId) {
        return;
      }

      set(
        marksOf(
          await window.pupitre.setInstallSecret(serverId, moduleId, key, value)
        )
      );
    },

    async generate(moduleId, key) {
      const serverId = serverOf(get().catalog);

      if (!serverId) {
        return;
      }

      set(
        marksOf(
          await window.pupitre.generateInstallSecret(serverId, moduleId, key)
        )
      );
    },

    /**
     * The one time a secret comes back across the bridge. The caller shows it
     * and drops it; asking again answers nothing.
     */
    async reveal(moduleId, key) {
      const serverId = serverOf(get().catalog);

      if (!serverId) {
        return null;
      }

      const answer = await window.pupitre.revealInstallSecret(
        serverId,
        moduleId,
        key
      );
      set({ secrets: answer.marks });

      return answer.value;
    },

    async forget() {
      const serverId = serverOf(get().catalog);

      if (serverId) {
        await window.pupitre.forgetInstallSecrets(serverId);
      }

      set({ secrets: {} });
    },

    settled() {
      return pending.then(() => undefined);
    },

    modules() {
      return catalogOf(get().catalog).modules;
    },

    groups() {
      return fieldsOf(get().modules(), get().selected);
    },

    problems() {
      return [
        ...problemsOf(
          get().modules(),
          get().selected,
          get().values,
          get().secrets,
          (kind) => useConnections.getState().holds(kind)
        ),
        ...get().refused,
      ];
    },

    /**
     * A field says what is wrong with it once it has been answered, or once an
     * install has been asked for. Before that the form is a page of empty
     * required fields, and marking them all red on arrival tells nobody
     * anything they did not already know.
     */
    shown() {
      const { touched, attempted } = get();

      return get()
        .problems()
        .filter(
          (problem) =>
            attempted ||
            problem.code === "connection" ||
            touched.has(`${problem.module}.${problem.field}`)
        );
    },

    touch(moduleId, key) {
      set((state) => {
        const touched = new Set(state.touched);
        touched.add(`${moduleId}.${key}`);

        return { touched };
      });
    },

    attempt() {
      set({ attempted: true });
    },

    /**
     * What only the server could know — a port another program already listens
     * on, a directory that is a file — put back on the field it belongs to. It
     * is dropped the moment that field changes, because the answer may have
     * been the whole point.
     */
    noteProblems(problems) {
      const known = new Map(
        get()
          .modules()
          .map((one) => [one.id, one])
      );

      set({
        attempted: true,
        refused: problems.map((problem) => {
          const manifest = known.get(problem.module) as Manifest;

          return {
            ...problem,
            declared: manifest?.fields.find((one) => one.key === problem.field),
            manifest,
          };
        }),
      });
    },

    /**
     * The last thing only the machine knows: a port another program already
     * listens on, a directory that is a file. An agent too old to answer says
     * so, and the app goes on with what it checked itself — refusing an install
     * because the server cannot weigh it would refuse the ones this exists for.
     */
    async check(modules) {
      const serverId = serverOf(get().catalog);

      if (!serverId || modules.length === 0) {
        return [];
      }

      const answer = await window.pupitre.checkInstall(
        serverId,
        modules,
        get().config()
      );

      if (!answer.ok) {
        return [];
      }

      get().noteProblems(answer.result.problems);

      return get().refused;
    },

    unreachable() {
      return blocked(
        get().modules(),
        get().selected,
        probeOf(serverOf(get().catalog)),
        get().installed
      );
    },

    warnings() {
      return resourceWarnings(
        get().modules(),
        get().selected,
        probeOf(serverOf(get().catalog))
      );
    },

    /** What `install` will carry in `params`: the values, never the secrets. */
    config() {
      const config: ModuleConfig = {};

      for (const id of get().selected) {
        config[id] = { ...get().values[id] };
      }

      return config;
    },

    reset() {
      pending = Promise.resolve();
      set({
        attempted: false,
        catalog: { status: "idle" },
        installed: [],
        refused: [],
        secrets: {},
        selected: [],
        touched: new Set<string>(),
        values: {},
      });
    },
  };
});
