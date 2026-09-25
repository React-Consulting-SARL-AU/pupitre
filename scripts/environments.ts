import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")

export const CONFIG_FILE = join(ROOT, "environments.json")

export const LOCAL_ENVIRONMENT = "local"

export interface Environment {
  name: string
  item: string
  database?: string
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
      "usage: bun run env <local|production> -- <command> [arguments]"
    )
  }

  return { argv, name }
}
