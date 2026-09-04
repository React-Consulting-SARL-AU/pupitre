import type {
  CatalogResult,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { Manifest, Preset } from "@pupitre/shared/catalog";
import type { AgentError } from "@shared/agent";
import type { SecretMarks } from "@shared/secrets";
import { create } from "zustand";
import {
  blocked,
  defaultsOf,
  type FieldGroup,
  fieldsOf,
  fromPreset,
  generatedKeysOf,
  mandatory,
  type ResourceWarning,
  resourceWarnings,
  toggle as toggleIn,
} from "../lib/catalog-selection";
import { probeOf } from "./inspection";

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

type CatalogStore = {
  catalog: CatalogState;
  selected: readonly string[];
  values: Record<string, Record<string, unknown>>;
  secrets: SecretMarks;

  load: (serverId: string) => Promise<void>;
  toggle: (moduleId: string) => void;
  usePreset: (presetId: string) => void;
  setValue: (moduleId: string, key: string, value: unknown) => void;

  setSecret: (moduleId: string, key: string, value: string) => Promise<void>;
  generate: (moduleId: string, key: string) => Promise<void>;
  reveal: (moduleId: string, key: string) => Promise<string | null>;
  forget: () => Promise<void>;
  /** Waits on the secrets a selection asked the main process to make. */
  settled: () => Promise<void>;

  modules: () => readonly Manifest[];
  groups: () => FieldGroup[];
  unreachable: () => Map<string, string>;
  warnings: () => ResourceWarning[];
  config: () => ModuleConfig;
  reset: () => void;
};

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
          set({
            secrets: await window.pupitre.generateInstallSecret(
              serverId,
              module.id,
              key
            ),
          });
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
    catalog: { status: "idle" },
    selected: [],
    values: {},
    secrets: {},

    async load(serverId) {
      set({ catalog: { serverId, status: "loading" } });

      const answer = await window.pupitre.catalog(serverId);

      if (!answer.ok) {
        set({ catalog: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      set({
        catalog: { catalog: answer.result, serverId, status: "ready" },
        secrets: {},
        selected: [],
        values: {},
      });

      reselect(mandatory(answer.result.modules));
    },

    toggle(moduleId) {
      if (get().unreachable().has(moduleId)) {
        return;
      }

      reselect(toggleIn(get().modules(), get().selected, moduleId));
    },

    usePreset(presetId) {
      const preset: Preset | undefined = catalogOf(get().catalog).presets.find(
        (candidate) => candidate.id === presetId
      );

      if (preset) {
        reselect(fromPreset(get().modules(), preset));
      }
    },

    setValue(moduleId, key, value) {
      set((state) => ({
        values: {
          ...state.values,
          [moduleId]: { ...state.values[moduleId], [key]: value },
        },
      }));
    },

    async setSecret(moduleId, key, value) {
      const serverId = serverOf(get().catalog);

      if (!serverId) {
        return;
      }

      set({
        secrets: await window.pupitre.setInstallSecret(
          serverId,
          moduleId,
          key,
          value
        ),
      });
    },

    async generate(moduleId, key) {
      const serverId = serverOf(get().catalog);

      if (!serverId) {
        return;
      }

      set({
        secrets: await window.pupitre.generateInstallSecret(
          serverId,
          moduleId,
          key
        ),
      });
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

    unreachable() {
      return blocked(
        get().modules(),
        get().selected,
        probeOf(serverOf(get().catalog))
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
        catalog: { status: "idle" },
        secrets: {},
        selected: [],
        values: {},
      });
    },
  };
});
