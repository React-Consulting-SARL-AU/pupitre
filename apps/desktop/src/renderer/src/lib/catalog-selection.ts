import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import {
  type Field,
  type Manifest,
  MODULE_CATEGORIES,
  type ModuleCategory,
  type Preset,
} from "@pupitre/shared/catalog";
import {
  type FieldProblem,
  type SecretsHeld,
  validateConfig,
} from "@pupitre/shared/catalog/validate";
import { translate } from "@renderer/i18n/translate";
import { itemKey, type SecretMark } from "@shared/secrets";
import { decimal } from "./format";

export type Selection = readonly string[];

export type Installed = readonly string[];

export interface FieldGroup {
  module: Manifest;
  fields: readonly Field[];
}

export interface CategoryGroup {
  category: ModuleCategory;
  modules: readonly Manifest[];
}

export interface Resources {
  ram_mb: number;
  disk_mb: number;
}

export interface ResourceWarning {
  kind: "ram" | "disk";
  message: string;
}

const MB_PER_GB = 1024;

function index(modules: readonly Manifest[]): Map<string, Manifest> {
  return new Map(modules.map((module) => [module.id, module]));
}

function ordered(
  modules: readonly Manifest[],
  ids: Iterable<string>
): string[] {
  const wanted = new Set(ids);

  return modules.filter((m) => wanted.has(m.id)).map((m) => m.id);
}

export function mandatory(
  modules: readonly Manifest[],
  installed: Installed = []
): string[] {
  return modules
    .filter((m) => m.mandatory && !installed.includes(m.id))
    .map((m) => m.id);
}

export function byCategory(modules: readonly Manifest[]): CategoryGroup[] {
  return MODULE_CATEGORIES.map((category) => ({
    category,
    modules: modules.filter((module) => module.category === category),
  })).filter((group) => group.modules.length > 0);
}

/** All requirements or nothing: half a choice would install a module without what it needs. */
export function select(
  modules: readonly Manifest[],
  selected: Selection,
  id: string,
  installed: Installed = [],
  probe: ProbeResult | null = null
): string[] {
  const known = index(modules);
  const chosen = new Set(selected);
  const adding: string[] = [];
  const queue = [id];

  while (queue.length > 0) {
    const next = queue.shift() as string;
    const manifest = known.get(next);

    if (chosen.has(next) || adding.includes(next) || installed.includes(next)) {
      continue;
    }

    if (
      !manifest ||
      blocked(modules, [...chosen, ...adding], probe, installed).has(next)
    ) {
      return [...selected];
    }

    adding.push(next);
    queue.push(...manifest.requires);
  }

  return ordered(modules, [...chosen, ...adding]);
}

export function deselect(
  modules: readonly Manifest[],
  selected: Selection,
  id: string
): string[] {
  const known = index(modules);

  if (known.get(id)?.mandatory) {
    return [...selected];
  }

  const dropped = new Set([id]);
  let growing = true;

  while (growing) {
    growing = false;

    for (const candidate of selected) {
      if (dropped.has(candidate)) {
        continue;
      }

      const needs = known.get(candidate)?.requires ?? [];

      if (needs.some((need) => dropped.has(need))) {
        dropped.add(candidate);
        growing = true;
      }
    }
  }

  const kept = selected.filter(
    (candidate) => !dropped.has(candidate) || known.get(candidate)?.mandatory
  );

  return ordered(modules, kept);
}

export function toggle(
  modules: readonly Manifest[],
  selected: Selection,
  id: string,
  installed: Installed = [],
  probe: ProbeResult | null = null
): string[] {
  return selected.includes(id)
    ? deselect(modules, selected, id)
    : select(modules, selected, id, installed, probe);
}

/** Drops what this machine cannot run, so a preset never yields a selection the install refuses. */
export function fromPreset(
  modules: readonly Manifest[],
  preset: Preset,
  installed: Installed = [],
  probe: ProbeResult | null = null
): string[] {
  let chosen: Selection = [];

  for (const id of [...mandatory(modules, installed), ...preset.modules]) {
    chosen = select(modules, chosen, id, installed, probe);
  }

  return ordered(modules, chosen);
}

export function withChoice(preset: Preset, chosen?: string): Preset {
  return chosen && preset.choose_one?.includes(chosen)
    ? { ...preset, modules: [...preset.modules, chosen] }
    : preset;
}

export function droppedBy(
  modules: readonly Manifest[],
  preset: Preset,
  selected: Selection,
  installed: Installed = [],
  probe: ProbeResult | null = null
): Manifest[] {
  const kept = new Set(fromPreset(modules, preset, installed, probe));
  const known = index(modules);

  return selected.flatMap((id) => {
    const manifest = known.get(id);

    return manifest && !kept.has(id) ? [manifest] : [];
  });
}

export function blocked(
  modules: readonly Manifest[],
  selected: Selection,
  probe: ProbeResult | null,
  installed: Installed = []
): Map<string, string> {
  const known = index(modules);
  const chosen = new Set(selected);
  const why = new Map<string, string>();

  for (const module of modules) {
    if (chosen.has(module.id)) {
      continue;
    }

    if (installed.includes(module.id)) {
      why.set(module.id, translate()("catalog.blocked.installed"));
      continue;
    }

    if (probe && !(module.arch as readonly string[]).includes(probe.arch)) {
      why.set(
        module.id,
        translate()("catalog.blocked.arch", { arch: probe.arch })
      );
      continue;
    }

    const collides = (other: string) =>
      module.conflicts.includes(other) ||
      (known.get(other)?.conflicts ?? []).includes(module.id);

    const running = installed.find(collides);

    if (running) {
      why.set(
        module.id,
        translate()("catalog.blocked.conflictInstalled", {
          name: known.get(running)?.name ?? running,
        })
      );
      continue;
    }

    const against = [...chosen].find(collides);

    if (against) {
      why.set(
        module.id,
        translate()("catalog.blocked.conflict", {
          name: known.get(against)?.name ?? against,
        })
      );
    }
  }

  return why;
}

export interface PresetOffer {
  preset: Preset;
  /** Includes the mandatory core the preset implies. */
  installs: readonly Manifest[];
  adds: readonly Manifest[];
  choices: readonly Manifest[];
  applied: boolean;
}

function same(a: Selection, b: Selection): boolean {
  const held = new Set(b);

  return a.length === b.length && a.every((id) => held.has(id));
}

export function presetOffer(
  modules: readonly Manifest[],
  preset: Preset,
  selected: Selection,
  installed: Installed = [],
  probe: ProbeResult | null = null
): PresetOffer {
  const known = index(modules);
  const base = fromPreset(modules, preset, installed, probe);
  const unreachable = blocked(modules, base, probe, installed);

  const choices: Manifest[] = [];

  for (const id of preset.choose_one ?? []) {
    const manifest = known.get(id);

    if (manifest && !installed.includes(id) && !unreachable.has(id)) {
      choices.push(manifest);
    }
  }

  const installs: Manifest[] = [];

  for (const id of base) {
    const manifest = known.get(id);

    if (manifest) {
      installs.push(manifest);
    }
  }

  const outcomes = [
    base,
    ...choices.map((one) => select(modules, base, one.id, installed, probe)),
  ];

  return {
    adds: installs.filter((one) => !one.mandatory),
    applied: outcomes.some((outcome) => same(outcome, selected)),
    choices,
    installs,
    preset,
  };
}

export function presetOffers(
  modules: readonly Manifest[],
  presets: readonly Preset[],
  selected: Selection,
  installed: Installed = [],
  probe: ProbeResult | null = null
): PresetOffer[] {
  return presets.map((preset) =>
    presetOffer(modules, preset, selected, installed, probe)
  );
}

export function bringsNothing(offer: PresetOffer): boolean {
  return offer.installs.length === 0 && offer.choices.length === 0;
}

const DIACRITICS = /\p{Diacritic}/gu;
const SPACES = /\s+/;

function plain(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

export function matching(
  modules: readonly Manifest[],
  query: string
): readonly Manifest[] {
  const terms = plain(query).split(SPACES).filter(Boolean);

  if (terms.length === 0) {
    return modules;
  }

  return modules.filter((module) => {
    const words = plain(`${module.name} ${module.summary} ${module.id}`);

    return terms.every((term) => words.includes(term));
  });
}

export function totals(
  modules: readonly Manifest[],
  selected: Selection
): Resources {
  const chosen = new Set(selected);

  return modules
    .filter((module) => chosen.has(module.id))
    .reduce(
      (sum, module) => ({
        ram_mb: sum.ram_mb + module.resources.ram_mb,
        disk_mb: sum.disk_mb + module.resources.disk_mb,
      }),
      { ram_mb: 0, disk_mb: 0 }
    );
}

/** Silent without a probe: an unmeasured machine is not one that is too small. */
export function resourceWarnings(
  modules: readonly Manifest[],
  selected: Selection,
  probe: ProbeResult | null
): ResourceWarning[] {
  if (!probe) {
    return [];
  }

  const asked = totals(modules, selected);
  const warnings: ResourceWarning[] = [];

  if (asked.ram_mb > probe.ram_mb) {
    warnings.push({
      kind: "ram",
      message: translate()("catalog.warning.ram", {
        asked: asked.ram_mb,
        has: probe.ram_mb,
      }),
    });
  }

  if (asked.disk_mb > probe.disk_free_gb * MB_PER_GB) {
    warnings.push({
      kind: "disk",
      message: translate()("catalog.warning.disk", {
        asked: decimal(asked.disk_mb / MB_PER_GB),
        has: decimal(probe.disk_free_gb),
      }),
    });
  }

  return warnings;
}

export function fieldsOf(
  modules: readonly Manifest[],
  selected: Selection
): FieldGroup[] {
  const chosen = new Set(selected);

  return modules
    .filter((module) => chosen.has(module.id))
    .map((module) => ({
      module,
      fields: module.fields.filter((field) => field.managed !== true),
    }));
}

type Marks = Record<string, SecretMark>;

export interface FieldProblemView extends FieldProblem {
  manifest: Manifest;
  declared?: Field;
}

export function heldSecrets(secrets: Record<string, Marks>): SecretsHeld {
  return (moduleId, key) => {
    const marks = secrets[moduleId];

    if (marks?.[key]?.filled) {
      return 1;
    }

    let filled = 0;

    while (marks?.[itemKey(key, filled)]?.filled) {
      filled += 1;
    }

    return filled;
  };
}

/** The agent's own rules, so what this screen accepts the server accepts; managed fields are filled on the way out. */
export function problemsOf(
  modules: readonly Manifest[],
  selected: Selection,
  values: Record<string, Record<string, unknown>>,
  secrets: Record<string, Marks>,
  connected?: (kind: string) => boolean,
  deferred?: readonly string[]
): FieldProblemView[] {
  const known = index(modules);

  return validateConfig(modules, selected, values, heldSecrets(secrets), {
    connected,
    deferred,
    skipManaged: true,
  }).map((problem) => {
    const manifest = known.get(problem.module) as Manifest;

    return {
      ...problem,
      declared: manifest?.fields.find((one) => one.key === problem.field),
      manifest,
    };
  });
}

/** Decided by the manifest, not the value, so a field never moves once answered. */
export function asked(field: Field): boolean {
  if (field.kind === "secret") {
    return true;
  }

  if (field.kind === "list") {
    return field.items === "secret" || (field.min ?? 0) > 0;
  }

  if (
    field.kind === "boolean" ||
    field.kind === "version" ||
    field.kind === "versions"
  ) {
    return false;
  }

  return field.required && field.default === undefined;
}

export interface SplitFields {
  asked: readonly Field[];
  kept: readonly Field[];
}

export function splitFields(fields: readonly Field[]): SplitFields {
  return {
    asked: fields.filter((field) => asked(field)),
    kept: fields.filter((field) => !asked(field)),
  };
}

export function defaultsOf(manifest: Manifest): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of manifest.fields) {
    if (field.kind === "secret" || field.managed === true) {
      continue;
    }

    if (
      field.kind === "version" ||
      field.kind === "versions" ||
      field.kind === "boolean"
    ) {
      values[field.key] = field.default;
      continue;
    }

    if (field.kind === "list") {
      values[field.key] = [];
      continue;
    }

    if (field.default !== undefined) {
      values[field.key] = field.default;
    }
  }

  return values;
}

export function generatedKeysOf(manifest: Manifest): string[] {
  return manifest.fields
    .filter(
      (field) =>
        field.kind === "secret" &&
        field.generate === true &&
        field.managed !== true
    )
    .map((field) => field.key);
}

/** The vault empties once secrets are sent, so replaying such a module must ask again. */
export function carriesSecret(manifest: Manifest): boolean {
  return manifest.fields.some(
    (field) =>
      field.managed !== true &&
      (field.kind === "secret" ||
        (field.kind === "list" && field.items === "secret"))
  );
}

export function restored(
  modules: readonly Manifest[],
  selected: Selection,
  installed: Installed = []
): string[] {
  const wanted = new Set(selected);

  return modules
    .filter((module) => wanted.has(module.id) && !installed.includes(module.id))
    .map((module) => module.id);
}
