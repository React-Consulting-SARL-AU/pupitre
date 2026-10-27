import { createHash, createPrivateKey, type KeyObject, sign } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  type Artefact,
  absoluteFeed,
  artefactOf,
  FEEDS,
  feedKey,
  isCompanion,
  objectKey,
  signedAppMessage,
  signedArtefactOf,
} from "../../apps/desktop/scripts/release-artefacts"
import { NOTES_LOCALE, readEntry } from "../release-notes"
import { hasFlag, say, VARIABLES, variable } from "./cli"
import { type AppPublication, declareApp, platformFromEnv } from "./platform"
import { type Bucket, bucket, keys, put } from "./r2"

// Runner only: the release key lives in the runner's secrets, never on a workstation.
const ROOT = path.resolve(import.meta.dir, "../..")

const WORK_DIR = path.join(ROOT, "apps/desktop/dist/publish")

const ED25519_PKCS8_PREFIX = "302e020100300506032b657004220420"

const SEED_BYTES = 32

// The raw 64-byte Ed25519 key wrapped as the PKCS#8 Node expects.
export function releaseKey(encoded: string): KeyObject {
  const raw = Buffer.from(encoded, "base64")

  if (raw.length !== 2 * SEED_BYTES) {
    throw new Error(`${VARIABLES.privateKey} is not an Ed25519 private key.`)
  }

  return createPrivateKey({
    format: "der",
    key: Buffer.concat([
      Buffer.from(ED25519_PKCS8_PREFIX, "hex"),
      raw.subarray(0, SEED_BYTES),
    ]),
    type: "pkcs8",
  })
}

export function signArtefact(
  key: KeyObject,
  version: string,
  os: string,
  arch: string,
  sha256: string
): string {
  return sign(null, signedAppMessage(version, os, arch, sha256), key).toString(
    "base64"
  )
}

interface Publish {
  version: string
  channel: string
  notes: string
  base: string
  key: KeyObject | null
  bucket: Bucket
}

// Each system's feed travels with its installers: a missing one is a build job that handed nothing over.
export function requireEverySystem(
  files: readonly string[],
  version: string
): void {
  const missing = FEEDS.filter((feed) => !files.includes(feed))

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} missing from ${WORK_DIR}: a system left no app for ${version}.`
    )
  }
}

function stagedFiles(version: string, dryRun: boolean): string[] {
  if (dryRun) {
    mkdirSync(WORK_DIR, { recursive: true })

    return []
  }

  const files = readdirSync(WORK_DIR).sort()

  requireEverySystem(files, version)

  return files
}

interface Signed {
  bytes: number
  sha256: string
  signature: string
}

async function publishSigned(
  file: string,
  artefact: Artefact,
  settings: Publish
): Promise<Signed> {
  const local = path.join(WORK_DIR, file)
  const content = readFileSync(local)
  const sha256 = createHash("sha256").update(content).digest("hex")
  const signature = settings.key
    ? signArtefact(
        settings.key,
        settings.version,
        artefact.os,
        artefact.arch,
        sha256
      )
    : ""

  writeFileSync(`${local}.sig`, `${signature}\n`)
  await put(settings.bucket, objectKey(settings.version, file), local)
  await put(
    settings.bucket,
    objectKey(settings.version, `${file}.sig`),
    `${local}.sig`
  )

  return { bytes: content.byteLength, sha256, signature }
}

async function publishInstaller(
  file: string,
  settings: Publish
): Promise<AppPublication | null> {
  const artefact = artefactOf(file)

  if (!artefact) {
    return null
  }

  const { bytes, sha256, signature } = await publishSigned(
    file,
    artefact,
    settings
  )

  return {
    arch: artefact.arch,
    bytes,
    channel: settings.channel,
    format: artefact.format,
    notes: settings.notes,
    os: artefact.os,
    r2_key: objectKey(settings.version, file),
    sha256,
    signature,
    version: settings.version,
  }
}

async function publishFeed(file: string, settings: Publish): Promise<void> {
  const local = path.join(WORK_DIR, file)

  writeFileSync(
    local,
    absoluteFeed(readFileSync(local, "utf8"), settings.base, settings.version)
  )
  await put(settings.bucket, objectKey(settings.version, file), local)
  await put(settings.bucket, feedKey(settings.channel, file), local)
}

export async function publishApp(
  env: NodeJS.ProcessEnv,
  dryRun: boolean
): Promise<void> {
  const version = variable(env, "version")
  const vault = bucket(variable(env, "agentBucket"), env, dryRun)
  const settings: Publish = {
    base: variable(env, "downloadsUrl"),
    bucket: bucket(variable(env, "downloadsBucket"), env, dryRun),
    channel: variable(env, "channel"),
    key:
      dryRun && !env[VARIABLES.privateKey]
        ? null
        : releaseKey(variable(env, "privateKey")),
    notes: readEntry(NOTES_LOCALE, version).body,
    version,
  }
  const platform = platformFromEnv(variable(env, "platform"), env, dryRun)
  const files = stagedFiles(version, dryRun)

  const publications: AppPublication[] = []

  for (const file of files) {
    const publication = await publishInstaller(file, settings)

    if (publication) {
      publications.push(publication)
    }
  }

  for (const file of files.filter(isCompanion)) {
    const signed = signedArtefactOf(file)

    if (signed) {
      await publishSigned(file, signed, settings)
    } else {
      await put(
        settings.bucket,
        objectKey(version, file),
        path.join(WORK_DIR, file)
      )
    }
  }

  for (const file of files.filter((one) => FEEDS.includes(one))) {
    await publishFeed(file, settings)
  }

  for (const publication of publications) {
    await declareApp(platform, publication)
  }

  const declarations = path.join(WORK_DIR, "publications.json")

  writeFileSync(declarations, `${JSON.stringify(publications, null, 2)}\n`)
  await put(vault, keys.appDeclarations(version), declarations)

  say(
    `app ${version}: ${publications.length} installers published in ${settings.channel} to ${platform.url}`
  )
}

export async function appCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const step = argv.find((value) => !value.startsWith("--"))

  if (step !== "publish") {
    throw new Error("usage: release app publish [--dry-run]")
  }

  await publishApp(env, hasFlag(argv, "dry-run"))
}
