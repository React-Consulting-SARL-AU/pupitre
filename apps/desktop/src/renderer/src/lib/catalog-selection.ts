import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import {
  type Field,
  type Manifest,
  MODULE_CATEGORIES,
  type ModuleCategory,
  type Preset,
} from "@pupitre/shared/catalog";
import { translate } from "@renderer/i18n/translate";

/**
 * What a selection of modules implies, computed from the manifests alone.
 *
 * Nothing here knows a module by name: dependencies, conflicts, architectures
 * and resources are read from what the agent declared, so a module added on the
 * server behaves like the others the moment it appears.
 */

export type Selection = readonly string[];

/**
 * The modules the server already runs.
 *
 * They are what makes the catalogue usable a second time: a module added after
 * the fact must not drag its already-satisfied requirements into the install,
 * and one that is already there is not a choice to make.
 */
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

/** The catalogue's own order, so the screen never re-sorts what it was given. */
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

function withRequirements(
  known: Map<string, Manifest>,
  chosen: Set<string>,
  id: string,
  installed: Installed
): void {
  if (chosen.has(id) || installed.includes(id)) {
    return;
  }

  chosen.add(id);

  for (const required of known.get(id)?.requires ?? []) {
    withRequirements(known, chosen, required, installed);
  }
}

export function select(
  modules: readonly Manifest[],
  selected: Selection,
  id: string,
  installed: Installed = []
): string[] {
  const known = index(modules);

  if (!known.has(id) || blocked(modules, selected, null, installed).has(id)) {
    return [...selected];
  }

  const chosen = new Set(selected);
  withRequirements(known, chosen, id, installed);

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
  id: string,
  installed: Installed = []
): string[] {
  return selected.includes(id)
    ? deselect(modules, selected, id)
    : select(modules, selected, id, installed);
}

export function fromPreset(
  modules: readonly Manifest[],
  preset: Preset,
  installed: Installed = []
): string[] {
  const known = index(modules);
  const chosen = new Set<string>();

  for (const id of [...mandatory(modules), ...preset.modules]) {
    if (known.has(id)) {
      withRequirements(known, chosen, id, installed);
    }
  }

  return ordered(modules, chosen);
}

/**
 * Why a module cannot be chosen right now, in the words the reader needs: it is
 * already there, it collides with another, or the architecture the probe
 * measured has nothing to run it.
 */
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

    const against = [...chosen].find(
      (other) =>
        module.conflicts.includes(other) ||
        (known.get(other)?.conflicts ?? []).includes(module.id)
    );

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
        asked: gigabytes(asked.disk_mb),
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

/**
 * A module whose install carried a secret.
 *
 * The vault is emptied the moment the secrets leave, so replaying such a module
 * without asking again would install it with nothing where its password was.
 */
export function carriesSecret(manifest: Manifest): boolean {
  return manifest.fields.some(
    (field) =>
      field.kind === "secret" ||
      (field.kind === "list" && field.items === "secret")
  );
}
