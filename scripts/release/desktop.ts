import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  artefactOf,
  isBlockmap,
  isFeed,
} from "../../apps/desktop/scripts/release-artefacts"
import { AGENT_DIST, ARCHES } from "./agent"
import { hasFlag, say, variable } from "./cli"
import { type Bucket, get, keys, put } from "./r2"
import { run } from "./shell"

/**
 * The app on the system this step runs on: built with the agent that was just
 * published embedded, signed where the system asks for it, then left in the
 * private bucket for the publish step — which runs anywhere, and signs every
 * file with the release key before anything becomes public.
 */

const ROOT = path.resolve(import.meta.dir, "../..")

const DESKTOP_DIR = path.join(ROOT, "apps/desktop")

const DESKTOP_DIST = path.join(DESKTOP_DIR, "dist")

export const SYSTEMS = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
} as const

export type System = (typeof SYSTEMS)[keyof typeof SYSTEMS]

/** The files a system's build hands to the publish step, listed for it. */
export const WORK_INDEX = "index.json"

export function systemOfHost(platform: string): System {
  const system = SYSTEMS[platform as keyof typeof SYSTEMS]

  if (!system) {
    throw new Error(`${platform} is not a system the app ships on.`)
  }

  return system
}

/** What a build leaves that the publish step wants: installers, their blockmaps, the feeds. */
export function publishable(files: readonly string[]): string[] {
  return files
    .filter(
      (file) => artefactOf(file) !== null || isBlockmap(file) || isFeed(file)
    )
    .sort()
}

/** macOS signs with a Developer ID and notarizes with an App Store Connect key; both, or neither. */
export function macSigning(
  env: NodeJS.ProcessEnv,
  keyFile: (content: string) => string
): NodeJS.ProcessEnv {
  const certificate = env.APPLE_CERTIFICATE
  const password = env.APPLE_CERTIFICATE_PASSWORD
  const keyContent = env.APPLE_API_KEY_CONTENT
  const keyId = env.APPLE_API_KEY_ID
  const issuer = env.APPLE_API_ISSUER

  if (certificate && password && keyContent && keyId && issuer) {
    return {
      APPLE_API_ISSUER: issuer,
      APPLE_API_KEY: keyFile(keyContent),
      APPLE_API_KEY_ID: keyId,
      CSC_KEY_PASSWORD: password,
      CSC_LINK: certificate,
    }
  }

  say(
    "Apple signing is not configured: the macOS build is neither signed nor notarized."
  )

  return { CSC_IDENTITY_AUTO_DISCOVERY: "false" }
}

/** Windows signs through Azure Trusted Signing when its three names are given. */
export function windowsSigning(env: NodeJS.ProcessEnv): string[] {
  const endpoint = env.AZURE_SIGNING_ENDPOINT
  const account = env.AZURE_SIGNING_ACCOUNT
  const profile = env.AZURE_SIGNING_PROFILE

  if (endpoint && account && profile) {
    return [
      `-c.win.azureSignOptions.endpoint=${endpoint}`,
      `-c.win.azureSignOptions.codeSigningAccountName=${account}`,
      `-c.win.azureSignOptions.certificateProfileName=${profile}`,
    ]
  }

  say("Azure Trusted Signing is not configured: the Windows build is unsigned.")

  return []
}

function fetchAgent(version: string, bucket: Bucket): void {
  mkdirSync(AGENT_DIST, { recursive: true })

  for (const file of [
    ...ARCHES.map((arch) => `pupitred-linux-${arch}`),
    "release.json",
  ]) {
    get(bucket, keys.agent(version, file), path.join(AGENT_DIST, file))
  }
}

function build(system: System, env: NodeJS.ProcessEnv, dryRun: boolean): void {
  const shared: NodeJS.ProcessEnv = {
    MAIN_VITE_UPDATE_CHANNEL: variable(env, "channel"),
    PUPITRE_AGENT_DIST: "../agent/dist/release",
    PUPITRE_DOWNLOADS_URL: variable(env, "downloadsUrl"),
  }

  run(["node", "node_modules/electron/install.js"], {
    cwd: DESKTOP_DIR,
    dryRun,
  })

  if (system === "macos") {
    const temp = mkdtempSync(path.join(tmpdir(), "pupitre-notarize-"))

    try {
      const signing = macSigning(env, (content) => {
        const file = path.join(temp, "apple-api-key.p8")

        writeFileSync(file, Buffer.from(content, "base64"), { mode: 0o600 })

        return file
      })

      run(["bun", "run", "build:mac"], {
        cwd: DESKTOP_DIR,
        dryRun,
        env: { ...shared, ...signing },
      })
    } finally {
      rmSync(temp, { force: true, recursive: true })
    }

    return
  }

  if (system === "windows") {
    run(["bun", "run", "build:win", ...windowsSigning(env)], {
      cwd: DESKTOP_DIR,
      dryRun,
      env: shared,
    })

    return
  }

  run(["bun", "run", "build:linux"], { cwd: DESKTOP_DIR, dryRun, env: shared })
}

function stage(system: System, version: string, bucket: Bucket): void {
  const files = publishable(bucket.dryRun ? [] : readdirSync(DESKTOP_DIST))

  if (files.length === 0 && !bucket.dryRun) {
    throw new Error(
      `${DESKTOP_DIST} holds nothing publishable: the build produced no installer.`
    )
  }

  const index = path.join(DESKTOP_DIST, WORK_INDEX)

  if (!bucket.dryRun) {
    writeFileSync(index, `${JSON.stringify(files, null, 2)}\n`)
  }

  for (const file of files) {
    put(bucket, keys.work(version, system, file), path.join(DESKTOP_DIST, file))
  }

  put(bucket, keys.work(version, system, WORK_INDEX), index)
  say(`${system}: ${files.length} files staged for ${version}`)
}

export function desktopCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): void {
  const dryRun = hasFlag(argv, "dry-run")
  const version = variable(env, "version")
  const bucket: Bucket = { dryRun, name: variable(env, "agentBucket") }
  const system = systemOfHost(process.platform)

  fetchAgent(version, bucket)
  build(system, env, dryRun)
  stage(system, version, bucket)
}
