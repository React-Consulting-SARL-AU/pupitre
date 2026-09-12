import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The two environments of the platform, read from `environments.json` at the
 * root: each one is a 1Password note and a Neon project, and nothing here
 * ever holds a value. The workstation lives in `staging` — its note, and a
 * branch of its project.
 */

const ROOT = join(import.meta.dir, "..")

export const CONFIG_FILE = join(ROOT, "environments.json")

export const LOCAL_ENVIRONMENT = "staging"

export interface Neon {
  project: string
  branch: string
}

export interface Environment {
  name: string
  item: string
  neon: Neon
}

export interface Environments {
  vault: string
  environments: Record<string, Omit<Environment, "name">>
}

export function readEnvironments(path = CONFIG_FILE): Environments {
  return JSON.parse(readFileSync(path, "utf8")) as Environments
}

export function environmentOf(
  name: string,
  config = readEnvironments()
): Environment {
  const found = config.environments[name]

  if (!found) {
    throw new Error(
      `${name} is not an environment: ${Object.keys(config.environments).join(" or ")}.`
    )
  }

  return { name, ...found }
}

interface NoteField {
  label?: string
  value?: string
}

/** Every named field of a note that has a value: the environment, as the Worker reads it. */
export function fieldsToEnv(note: {
  fields?: NoteField[]
}): Record<string, string> {
  const values: Record<string, string> = {}

  for (const field of note.fields ?? []) {
    if (field.label && field.value && field.label !== "notesPlain") {
      values[field.label] = field.value
    }
  }

  return values
}

export function commandOf(args: readonly string[]): {
  name: string
  argv: string[]
} {
  const [name, ...rest] = args
  const argv = rest[0] === "--" ? rest.slice(1) : rest

  if (!(name && argv.length > 0)) {
    throw new Error(
      "usage: bun run env <staging|production> -- <command> [arguments]"
    )
  }

  return { argv, name }
}
