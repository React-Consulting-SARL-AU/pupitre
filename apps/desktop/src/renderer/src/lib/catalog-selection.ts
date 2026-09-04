import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import {
  type Field,
  type Manifest,
  MODULE_CATEGORIES,
  type ModuleCategory,
  type Preset,
} from "@pupitre/shared/catalog";

/**
 * What a selection of modules implies, computed from the manifests alone.
 *
 * Nothing here knows a module by name: dependencies, conflicts, architectures
 * and resources are read from what the agent declared, so a module added on the
 * server behaves like the others the moment it appears.
 */

export type Selection = readonly string[];

export type FieldGroup = {
  module: Manifest;
  fields: readonly Field[];
};

export type CategoryGroup = {
  category: ModuleCategory;
  modules: readonly Manifest[];
};

export type Resources = {
  ram_mb: number;
  disk_mb: number;
};

export type ResourceWarning = {
  kind: "ram" | "disk";
  message: string;
};

const MB_PER_GB = 1024;

function index(modules: readonly Manifest[]): Map<string, Manifest> {
  return new Map(modules.map((module) => [module.id, module]));
}

/** The catalogue's own order, so the screen never re-sorts what it was given. */
function ordered(
  modules: readonly Manifest[],
  ids: Iterable<string>
): string[] {
  const wanted = new Set(ids);

  return modules.filter((m) => wanted.has(m.id)).map((m) => m.id);
}

export function mandatory(modules: readonly Manifest[]): string[] {
  return modules.filter((m) => m.mandatory).map((m) => m.id);
}

export function byCategory(modules: readonly Manifest[]): CategoryGroup[] {
  return MODULE_CATEGORIES.map((category) => ({
    category,
    modules: modules.filter((module) => module.category === category),
  })).filter((group) => group.modules.length > 0);
}

function withRequirements(
  known: Map<string, Manifest>,
  chosen: Set<string>,
  id: string
): void {
  if (chosen.has(id)) {
    return;
  }

  chosen.add(id);

  for (const required of known.get(id)?.requires ?? []) {
    withRequirements(known, chosen, required);
  }
}

export function select(
  modules: readonly Manifest[],
  selected: Selection,
  id: string
): string[] {
  const known = index(modules);

  if (!known.has(id) || blocked(modules, selected, null).has(id)) {
    return [...selected];
  }

  const chosen = new Set(selected);
  withRequirements(known, chosen, id);

  return ordered(modules, chosen);
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
  id: string
): string[] {
  return selected.includes(id)
    ? deselect(modules, selected, id)
    : select(modules, selected, id);
}

export function fromPreset(
  modules: readonly Manifest[],
  preset: Preset
): string[] {
  const known = index(modules);
  const chosen = new Set<string>();

  for (const id of [...mandatory(modules), ...preset.modules]) {
    if (known.has(id)) {
      withRequirements(known, chosen, id);
    }
  }

  return ordered(modules, chosen);
}

/**
 * Why a module cannot be chosen right now, in the words the reader needs: the
 * module it collides with, or the architecture the probe measured.
 */
export function blocked(
  modules: readonly Manifest[],
  selected: Selection,
  probe: ProbeResult | null
): Map<string, string> {
  const known = index(modules);
  const chosen = new Set(selected);
  const why = new Map<string, string>();

  for (const module of modules) {
    if (chosen.has(module.id)) {
      continue;
    }

    if (probe && !(module.arch as readonly string[]).includes(probe.arch)) {
      why.set(
        module.id,
        `Ce module n'existe pas pour l'architecture ${probe.arch}.`
      );
      continue;
    }

    const against = [...chosen].find(
      (other) =>
        module.conflicts.includes(other) ||
        (known.get(other)?.conflicts ?? []).includes(module.id)
    );

    if (against) {
      why.set(
        module.id,
        `En conflit avec « ${known.get(against)?.name ?? against} », déjà sélectionné.`
      );
    }
  }

  return why;
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

function gigabytes(mb: number): string {
  return (mb / MB_PER_GB).toFixed(1).replace(".", ",");
}

function decimal(gb: number): string {
  return gb.toFixed(1).replace(".", ",");
}

/**
 * What the selection asks for, against what the probe measured.
 *
 * Silent without a probe: an unmeasured machine is not a machine that is too
 * small, and inventing a threshold here would contradict the only figures the
 * app has.
 */
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
      message: `Les modules choisis demandent ${asked.ram_mb} Mo de mémoire ; cette machine en a ${probe.ram_mb}.`,
    });
  }

  if (asked.disk_mb > probe.disk_free_gb * MB_PER_GB) {
    warnings.push({
      kind: "disk",
      message: `Les modules choisis demandent ${gigabytes(asked.disk_mb)} Go de disque ; il en reste ${decimal(probe.disk_free_gb)} sur cette machine.`,
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
    .map((module) => ({ module, fields: module.fields }));
}

/** What a field is worth before anyone touches it, per its manifest. */
export function defaultsOf(manifest: Manifest): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of manifest.fields) {
    if (field.kind === "secret") {
      continue;
    }

    if (field.kind === "version" || field.kind === "boolean") {
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

/** The secret fields the manifest says to generate rather than ask for. */
export function generatedKeysOf(manifest: Manifest): string[] {
  return manifest.fields
    .filter((field) => field.kind === "secret" && field.generate === true)
    .map((field) => field.key);
}
