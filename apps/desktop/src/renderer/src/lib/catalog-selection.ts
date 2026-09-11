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

/**
 * A module and everything it requires, or nothing at all.
 *
 * A requirement the machine cannot run makes the whole choice impossible: half
 * of it would be a module installed without what it needs. The probe is weighed
 * here rather than by the caller, so a preset cannot tick what a click cannot.
 */
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

/**
 * What a preset amounts to on this machine.
 *
 * A preset names modules for a catalogue, not for a server: on an arm64 box, or
 * on one that already runs something its list contradicts, part of it simply
 * cannot happen. Those parts are dropped rather than ticked, so applying a
 * preset never leaves a selection the install would refuse.
 */
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

/**
 * Why a module cannot be chosen right now, in the words the reader needs: it is
 * already there, it collides with one the server already runs or with one just
 * chosen, or the architecture the probe measured has nothing to run it.
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

/**
 * A preset, weighed against this machine before it is offered.
 *
 * The catalogue's presets are written for the catalogue: the same three are
 * shown on a fresh server and on one that already runs half of them. What they
 * are worth here is not — hence `adds`, which names what applying it would
 * actually put on the machine, and `applied`, which is how the reader sees that
 * the click landed.
 */
export interface PresetOffer {
  preset: Preset;
  /** Everything it would install here, the core it implies included. */
  installs: readonly Manifest[];
  /** What it would add on top of that core: the promise its card carries. */
  adds: readonly Manifest[];
  /** The exclusive modules still open, once the machine has had its say. */
  choices: readonly Manifest[];
  /** True when what is selected is exactly what this preset yields. */
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

/**
 * A preset with nothing left to install: the server already runs all of it,
 * the core included. « Only the core » is not that — it is a choice, and one
 * a reader comes back to after ticking too much.
 */
export function bringsNothing(offer: PresetOffer): boolean {
  return offer.installs.length === 0 && offer.choices.length === 0;
}

const DIACRITICS = /\p{Diacritic}/gu;
const SPACES = /\s+/;

/** Lower case and without accents, so « préréglage » is found by "prereglage". */
function plain(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/**
 * The modules a search phrase leaves.
 *
 * The phrase is weighed against the words the agent gave — name, summary,
 * identifier — because those are what the reader sees on the cards. Every term
 * has to land somewhere, so a second word narrows rather than widens.
 */
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
        asked: decimal(asked.disk_mb / MB_PER_GB),
        has: decimal(probe.disk_free_gb),
      }),
    });
  }

  return warnings;
}

/**
 * A `managed` field is never asked for: its value comes from the platform, and
 * the configuration screen never shows it. A module whose fields are all
 * managed therefore asks nothing, and reads as such.
 */
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

/** A problem, and the manifest and field it belongs to, so a screen can draw it. */
export interface FieldProblemView extends FieldProblem {
  manifest: Manifest;
  /** The field the problem names, when the manifest still declares one. */
  declared?: Field;
}

/** How many values are held for a secret field: one, or the ranks of a secret list. */
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

/**
 * What the chosen modules refuse, by the rules of the manifest and nothing
 * else — the same rules the agent applies to the same values before its first
 * step, so a configuration this screen accepts is one the server accepts.
 *
 * A managed field is skipped: the app fills it on the way out, from a
 * connection, and a form that asked for it would be asking twice.
 */
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

/**
 * Whether a field has to be answered before the install, or can be left as
 * the manifest set it.
 *
 * A secret is always shown: typed, it is the one thing the reader must supply;
 * generated, the line saying so is what tells them no password is theirs to
 * invent. Everything that came with a default is a setting, not a question —
 * and a question stays one once answered, so nothing moves under the reader.
 */
export function asked(field: Field): boolean {
  if (field.kind === "secret") {
    return true;
  }

  if (field.kind === "list") {
    return field.items === "secret" || (field.min ?? 0) > 0;
  }

  if (field.kind === "boolean" || field.kind === "version") {
    return false;
  }

  return field.required && field.default === undefined;
}

export interface SplitFields {
  /** What the reader has to answer. */
  asked: readonly Field[];
  /** What the manifest already answered, and can be changed. */
  kept: readonly Field[];
}

export function splitFields(fields: readonly Field[]): SplitFields {
  return {
    asked: fields.filter((field) => asked(field)),
    kept: fields.filter((field) => !asked(field)),
  };
}

/** What a field is worth before anyone touches it, per its manifest. */
export function defaultsOf(manifest: Manifest): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of manifest.fields) {
    if (field.kind === "secret" || field.managed === true) {
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
    .filter(
      (field) =>
        field.kind === "secret" &&
        field.generate === true &&
        field.managed !== true
    )
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
      field.managed !== true &&
      (field.kind === "secret" ||
        (field.kind === "list" && field.items === "secret"))
  );
}

/**
 * A selection written down before the app closed, read back against the machine
 * as it stands now.
 *
 * What the catalogue no longer declares is dropped, what the server already
 * runs is dropped with it: the reader comes back to the choice they made, minus
 * the part of it that has since become a fact.
 */
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
