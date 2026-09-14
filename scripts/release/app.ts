import { createHash, createPrivateKey, type KeyObject, sign } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  absoluteFeed,
  artefactOf,
  FEEDS,
  feedKey,
  isCompanion,
  objectKey,
  signedAppMessage,
} from "../../apps/desktop/scripts/release-artefacts"
import { NOTES_LOCALE, readEntry } from "../release-notes"
import { hasFlag, say, VARIABLES, variable } from "./cli"
import { SYSTEMS, type System, WORK_INDEX } from "./desktop"
import { type AppPublication, declareApp, platformFromEnv } from "./platform"
import { type Bucket, bucket, get, keys, put } from "./r2"

/**
 * The app, made public: every installer the three systems left in the private
 * bucket is signed with the release key, put in the public bucket with its
 * signature alongside, and declared to the platform. The updater's feeds go
 * up rewritten to point at the version's folder, under the channel's. The
 * rows declared are kept with the agent's, so that `promote` can say them
 * again to production without rebuilding anything.
 *
 * Nothing here runs on a workstation: the release key lives in the runner's
 * secrets, and travels in its environment only.
 */

const ROOT = path.resolve(import.meta.dir, "../..")

const WORK_DIR = path.join(ROOT, "apps/desktop/dist/publish")

const ED25519_PKCS8_PREFIX = "302e020100300506032b657004220420"

const SEED_BYTES = 32

/** The raw 64 bytes Ed25519 calls a private key, wrapped as Node wants them. */
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
  vault: Bucket
}

async function fetchWork(version: string, vault: Bucket): Promise<string[]> {
  mkdirSync(WORK_DIR, { recursive: true })

  const files: string[] = []

  for (const system of Object.values(SYSTEMS) as System[]) {
    const index = path.join(WORK_DIR, `${system}-${WORK_INDEX}`)

    await get(vault, keys.work(version, system, WORK_INDEX), index)

    const listed = vault.dryRun
      ? []
      : (JSON.parse(readFileSync(index, "utf8")) as string[])

    for (const file of listed) {
      await get(
        vault,
        keys.work(version, system, file),
        path.join(WORK_DIR, file)
      )
      files.push(file)
    }
  }

  return files.sort()
}

async function publishInstaller(
  file: string,
  settings: Publish
): Promise<AppPublication | null> {
  const artefact = artefactOf(file)

  if (!artefact) {
    return null
  }

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

  return {
    arch: artefact.arch,
    bytes: content.byteLength,
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
    vault,
    version,
  }
  const platform = platformFromEnv(variable(env, "platform"), env, dryRun)
  const files = await fetchWork(version, vault)

  if (files.length === 0 && !dryRun) {
    throw new Error(`no system left an installer for ${version}.`)
  }

  const publications: AppPublication[] = []

  for (const file of files) {
    const publication = await publishInstaller(file, settings)

    if (publication) {
      publications.push(publication)
    }
  }

  for (const file of files.filter(isCompanion)) {
    await put(
      settings.bucket,
      objectKey(version, file),
      path.join(WORK_DIR, file)
    )
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
