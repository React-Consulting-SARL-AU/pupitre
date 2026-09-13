import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import {
  fieldsToEnv,
  LOCAL_ENVIRONMENT,
  readEnvironments,
} from "./environments"
import { parseTemplate, TEMPLATE } from "./release/secrets"

/**
 * The secrets nobody has to fetch anywhere: drawn here and deposited in the
 * 1Password notes, so no value is ever typed by hand. A field that already
 * holds a value is left alone — rotating a session secret signs everyone out;
 * empty the field in 1Password to have it drawn again. Nothing is printed
 * but names.
 */

const PUBLISH_TOKEN_PREFIX = "pupitre_pub_"

/** Each environment note gets its own, except the workstation, which draws them itself (`dev:prepare`). */
export const DRAWN_PER_ENVIRONMENT = [
  "BETTER_AUTH_SECRET",
  "INTERNAL_WORKFLOW_SECRET",
] as const

/** One value, word for word the same in every environment note and in the release note. */
export const DRAWN_ONCE = "PUPITRE_PUBLISH_TOKEN"

export interface Note {
  vault: string
  item: string
}

export interface NoteState extends Note {
  fields: Record<string, string>
}

export interface Draw extends Note {
  field: string
  value: string
}

export interface DrawInput {
  environments: (NoteState & { name: string })[]
  release: NoteState
}

export function drawSecret(): string {
  return randomBytes(32).toString("base64url")
}

export function drawPublishToken(): string {
  return `${PUBLISH_TOKEN_PREFIX}${drawSecret()}`
}

export function releaseNoteOf(template: string): Note {
  const line = parseTemplate(template).find(
    (one) => one.name === DRAWN_ONCE && one.secret
  )

  if (!line) {
    throw new Error(
      `${DRAWN_ONCE} has no 1Password reference in ${TEMPLATE}: the release note is unknown.`
    )
  }

  const [vault, item] = line.value.slice("op://".length).split("/")

  if (!(vault && item)) {
    throw new Error(`${line.value} is not an op://vault/item/field reference.`)
  }

  return { item, vault }
}

function drawFor(note: Note, field: string, value: string): Draw {
  return { field, item: note.item, value, vault: note.vault }
}

function sharedValue(notes: NoteState[]): string | null {
  const held = new Set(
    notes.map((note) => note.fields[DRAWN_ONCE]).filter(Boolean)
  )

  if (held.size > 1) {
    throw new Error(
      `${DRAWN_ONCE} differs between ${notes
        .filter((note) => note.fields[DRAWN_ONCE])
        .map((note) => note.item)
        .join(
          " and "
        )}: the release routes only open on the same value. Empty the wrong one, then draw again.`
    )
  }

  return held.values().next().value ?? null
}

export function drawsFor(
  { environments, release }: DrawInput,
  draw = { secret: drawSecret, publishToken: drawPublishToken }
): Draw[] {
  const draws: Draw[] = []

  for (const note of environments) {
    if (note.name === LOCAL_ENVIRONMENT) {
      continue
    }

    for (const field of DRAWN_PER_ENVIRONMENT) {
      if (!note.fields[field]) {
        draws.push(drawFor(note, field, draw.secret()))
      }
    }
  }

  const everyNote = [...environments, release]
  const token = sharedValue(everyNote) ?? draw.publishToken()

  for (const note of everyNote) {
    if (!note.fields[DRAWN_ONCE]) {
      draws.push(drawFor(note, DRAWN_ONCE, token))
    }
  }

  return draws
}

function readNote(note: Note): NoteState {
  const read = spawnSync(
    "op",
    ["item", "get", note.item, "--vault", note.vault, "--format", "json"],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }
  )

  if (read.status !== 0) {
    throw new Error(
      `the note ${note.item} could not be read: sign in with \`op signin\`, or create it in ${note.vault}.`
    )
  }

  return { ...note, fields: fieldsToEnv(JSON.parse(read.stdout)) }
}

function deposit({ field, item, value, vault }: Draw): void {
  const written = spawnSync(
    "op",
    ["item", "edit", item, "--vault", vault, `${field}[password]=${value}`],
    { encoding: "utf8", stdio: ["inherit", "ignore", "inherit"] }
  )

  if (written.status !== 0) {
    throw new Error(`${field} could not be written to ${item}.`)
  }

  process.stdout.write(`${item}: ${field} drawn\n`)
}

function main(): void {
  const config = readEnvironments()
  const environments = Object.entries(config.environments).map(
    ([name, environment]) => ({
      name,
      ...readNote({ item: environment.item, vault: config.vault }),
    })
  )
  const release = readNote(releaseNoteOf(readFileSync(TEMPLATE, "utf8")))
  const draws = drawsFor({ environments, release })

  for (const draw of draws) {
    deposit(draw)
  }

  process.stdout.write(
    draws.length > 0
      ? `${draws.length} secret(s) drawn. Set them on the Worker (\`wrangler secret bulk\`, docs/deploy.md) and on GitHub (\`bun run release secrets\`) if the value is new there.\n`
      : "Every secret that can be drawn already is.\n"
  )
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exit(1)
  }
}
