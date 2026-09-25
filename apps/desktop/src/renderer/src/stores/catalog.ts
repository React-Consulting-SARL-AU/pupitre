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
  withChoice,
} from "../lib/catalog-selection";
import { useConnections } from "./connections";
import { probeOf } from "./inspection";

function marksOf(answer: AgentResponse<SecretMarks>): {
  problem: AgentError | null;
  secrets?: SecretMarks;
} {
  return answer.ok
    ? { problem: null, secrets: answer.result }
    : { problem: answer.error };
}

export type CatalogState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "ready"; serverId: string; catalog: CatalogResult }
  | { status: "failed"; serverId: string; error: AgentError };

interface CatalogStore {
  catalog: CatalogState;
  selected: readonly string[];
  values: Record<string, Record<string, unknown>>;
  // Only marks: secret values stay in the main process, so this store is safe to dump.
  secrets: SecretMarks;
  problem: AgentError | null;
  installed: Installed;
  // Keys are `<module>.<key>`.
  touched: ReadonlySet<string>;
  attempted: boolean;
  refused: readonly FieldProblemView[];
  // Installed unconfigured: nothing of theirs is weighed and the server stops after placing them.
  deferred: readonly string[];
  // Secrets a restored machine already holds: they count as answered and are never regenerated.
  held: Record<string, readonly string[]>;
  // A connection missing on this computer does not hold these back.
  restoredModules: readonly string[];

  load: (serverId: string, installed?: Installed) => Promise<void>;
  restore: (
    selected: readonly string[],
    values: Record<string, Record<string, unknown>>
  ) => void;
  adoptRestore: (restored: {
    selected: readonly string[];
    values: Record<string, Record<string, unknown>>;
    held: Record<string, readonly string[]>;
    deferred: readonly string[];
  }) => void;
  toggle: (moduleId: string) => void;
  defer: (moduleId: string, later: boolean) => void;
  // `chosen` picks among the preset's mutually exclusive modules.
  usePreset: (presetId: string, chosen?: string) => void;
  setValue: (moduleId: string, key: string, value: unknown) => void;

  setSecret: (moduleId: string, key: string, value: string) => Promise<void>;
  generate: (moduleId: string, key: string) => Promise<void>;
  reveal: (moduleId: string, key: string) => Promise<string | null>;
  forget: () => Promise<void>;
  // A refused install empties the vault, so the "filled" marks no longer hold.
  dropSecrets: () => void;
  typedSecrets: () => boolean;
  // Resolves once the secrets generated for the selection exist.
  settled: () => Promise<void>;

  modules: () => readonly Manifest[];
  groups: () => FieldGroup[];
  problems: () => FieldProblemView[];
  shown: () => FieldProblemView[];
  touch: (moduleId: string, key: string) => void;
  attempt: () => void;
  noteProblems: (problems: readonly FieldProblem[]) => void;
  check: (modules: readonly string[]) => Promise<readonly FieldProblemView[]>;
  unreachable: () => Map<string, string>;
  warnings: () => ResourceWarning[];
  config: () => ModuleConfig;
  reset: () => void;
}

const EMPTY: CatalogResult = { modules: [], presets: [] };

function withHeld(
  secrets: SecretMarks,
  held: Record<string, readonly string[]>
): SecretMarks {
  const merged: SecretMarks = { ...secrets };

  for (const [moduleId, keys] of Object.entries(held)) {
    const marks = { ...merged[moduleId] };

    for (const key of keys) {
      marks[key] ??= { filled: true, generated: false, revealed: false };
    }

    merged[moduleId] = marks;
  }

  return merged;
}

function serverOf(state: CatalogState): string | null {
  return state.status === "idle" ? null : state.serverId;
}

function catalogOf(state: CatalogState): CatalogResult {
  return state.status === "ready" ? state.catalog : EMPTY;
}

export const useCatalog = create<CatalogStore>((set, get) => {
  let pending: Promise<unknown> = Promise.resolve();

  // Generated in the main process on selection, so the value never crosses the bridge.
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
        if (
          get().secrets[module.id]?.[key]?.filled ||
          get().held[module.id]?.includes(key)
        ) {
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

  // Development builds only; applied to a newly chosen module where nothing was answered.
  let prefilled: Record<string, Record<string, string>> = {};

  async function readDevDefaults(): Promise<void> {
    const defaults = await window.pupitre.devDefaults().catch(() => null);

    prefilled = defaults?.fields ?? {};
  }

  function prefill(module: Manifest, values: Record<string, unknown>) {
    const given = prefilled[module.id] ?? {};
    const filled = { ...values };

    for (const field of module.fields) {
      const value = given[field.key];

      if (value && !filled[field.key]) {
        filled[field.key] = value;
      }
    }

    return filled;
  }

  function reselect(next: readonly string[]): void {
    const previous = get().selected;
    const added = next.filter((id) => !previous.includes(id));
    const values = { ...get().values };

    for (const module of catalogOf(get().catalog).modules) {
      if (added.includes(module.id)) {
        values[module.id] = prefill(module, {
          ...defaultsOf(module),
          ...values[module.id],
        });
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
    deferred: [],
    held: {},
    installed: [],
    problem: null,
    refused: [],
    restoredModules: [],
    selected: [],
    touched: new Set<string>(),
    values: {},
    secrets: {},

    async load(serverId, installed = []) {
      set({ catalog: { serverId, status: "loading" }, installed });

      // Connections are weighed with the fields, so read them now, not when a card shows.
      const [answer] = await Promise.all([
        window.pupitre.catalog(serverId),
        useConnections.getState().read(),
        readDevDefaults(),
      ]);

      if (!answer.ok) {
        set({ catalog: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      set({
        attempted: false,
        catalog: { catalog: answer.result, serverId, status: "ready" },
        deferred: [],
        held: {},
        problem: null,
        refused: [],
        restoredModules: [],
        secrets: {},
        selected: [],
        touched: new Set<string>(),
        values: {},
      });

      reselect(mandatory(answer.result.modules, installed));
    },

    // Secrets are not restored; reselecting regenerates the generated ones.
    restore(selected, values) {
      if (get().catalog.status !== "ready") {
        return;
      }

      set({ values: { ...values } });
      reselect(restored(get().modules(), selected, get().installed));
    },

    // Held secrets are never redrawn: a new database password would lock restored projects out.
    adoptRestore({ selected, values, held, deferred }) {
      if (get().catalog.status !== "ready") {
        return;
      }

      set({
        deferred: [...deferred],
        held,
        restoredModules: [...selected],
        values: { ...values },
      });

      reselect(restored(get().modules(), selected, get().installed));
    },

    defer(moduleId, later) {
      const held = get().deferred;

      if (later === held.includes(moduleId)) {
        return;
      }

      set({
        deferred: later
          ? [...held, moduleId]
          : held.filter((one) => one !== moduleId),
        // A deferred module's refusals concern values this install no longer carries.
        refused: later
          ? get().refused.filter((one) => one.module !== moduleId)
          : get().refused,
      });
    },

    toggle(moduleId) {
      reselect(
        toggleIn(
          get().modules(),
          get().selected,
          moduleId,
          get().installed,
          probeOf(serverOf(get().catalog))
        )
      );
    },

    usePreset(presetId, chosen) {
      const preset: Preset | undefined = catalogOf(get().catalog).presets.find(
        (candidate) => candidate.id === presetId
      );

      if (!preset) {
        return;
      }

      reselect(
        fromPreset(
          get().modules(),
          withChoice(preset, chosen),
          get().installed,
          probeOf(serverOf(get().catalog))
        )
      );
    },

    setValue(moduleId, key, value) {
      set((state) => ({
        // A server refusal about this field was about the old value.
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

    // The only time a secret crosses the bridge: shown once by the caller, then dropped.
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

    dropSecrets() {
      set({ secrets: {} });
    },

    typedSecrets() {
      return Object.values(get().secrets).some((marks) =>
        Object.values(marks).some((mark) => mark.filled)
      );
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
      const restoredKinds: ReadonlySet<string> = new Set(
        get()
          .modules()
          .filter((module) => get().restoredModules.includes(module.id))
          .flatMap((module) => (module.connection ? [module.connection] : []))
      );

      return [
        ...problemsOf(
          get().modules(),
          get().selected,
          get().values,
          withHeld(get().secrets, get().held),
          (kind) =>
            useConnections.getState().holds(kind) || restoredKinds.has(kind),
          get().deferred
        ),
        ...get().refused,
      ];
    },

    // Held back until touched or an install is attempted, so a fresh form is not all red.
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

    noteProblems(problems) {
      const known = new Map(
        get()
          .modules()
          .map((one) => [one.id, one])
      );

      set({
        attempted: true,
        refused: problems.flatMap((problem) => {
          const manifest = known.get(problem.module) as Manifest;
          const declared = manifest?.fields.find(
            (one) => one.key === problem.field
          );

          // Managed values come from a connected account at install; no field here can answer them.
          if (declared?.managed === true) {
            return [];
          }

          return [{ ...problem, declared, manifest }];
        }),
      });
    },

    // An agent too old to check does not block the install: the local checks still apply.
    async check(modules) {
      const serverId = serverOf(get().catalog);

      if (!serverId || modules.length === 0) {
        return [];
      }

      // A silent bridge must not leave the button spinning; the agent re-checks before installing.
      const answer = await window.pupitre
        .checkInstall(serverId, modules, get().config(), get().deferred)
        .catch(() => null);

      if (!answer?.ok) {
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
        deferred: [],
        held: {},
        installed: [],
        problem: null,
        refused: [],
        restoredModules: [],
        secrets: {},
        selected: [],
        touched: new Set<string>(),
        values: {},
      });
    },
  };
});
