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
import { type Bucket, bucket, get, keys, put } from "./r2"
import { run } from "./shell"

/**
 * The app for the system this host runs: built with the agent that was just
 * published, signed where the system asks for it, then left in the private
 * bucket for the publish step — which runs anywhere, and signs every file
 * with the release key before anything becomes public.
 *
 * One system per host, and no cross-building: node-pty is compiled for the
 * machine that packages it, and notarization and Trusted Signing each run on
 * their own system only.
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

/** The updater feed each system reads. */
const FEED_OF: Record<System, string> = {
  linux: "latest-linux.yml",
  macos: "latest-mac.yml",
  windows: "latest.yml",
}

export function systemOfHost(platform: string): System {
  const system = SYSTEMS[platform as keyof typeof SYSTEMS]

  if (!system) {
    throw new Error(`${platform} is not a system the app ships on.`)
  }

  return system
}

/** What a build leaves for the publish step, for one system: its installers, their blockmaps, its feed. */
export function publishable(
  system: System,
  files: readonly string[]
): string[] {
  const ofSystem = (file: string) => artefactOf(file)?.os === system

  return files
    .filter(
      (file) =>
        ofSystem(file) ||
        (isBlockmap(file) && ofSystem(file.slice(0, -".blockmap".length))) ||
        (isFeed(file) && file === FEED_OF[system])
    )
    .sort()
}

/**
 * macOS signs with the Developer ID certificate it is given — a bare runner
 * imports it into a throwaway keychain — or, without one, with the identity
 * of this Mac's keychain; and notarizes with the App Store Connect key, given
 * as a file for as long as the build lasts. Without the key, the build is
 * neither signed nor notarized, and says so. Apple keeps a notarization
 * for minutes without a word: the debug output says where it stands.
 */
export function macSigning(
  env: NodeJS.ProcessEnv,
  keyFile: (content: string) => string
): NodeJS.ProcessEnv {
  const keyContent = env.APPLE_API_KEY_CONTENT
  const keyId = env.APPLE_API_KEY_ID
  const issuer = env.APPLE_API_ISSUER
  const certificate = env.APPLE_CERTIFICATE
  const password = env.APPLE_CERTIFICATE_PASSWORD

  if (keyContent && keyId && issuer) {
    return {
      APPLE_API_ISSUER: issuer,
      APPLE_API_KEY: keyFile(keyContent),
      APPLE_API_KEY_ID: keyId,
      DEBUG: "electron-notarize*",
      ...(certificate && password
        ? { CSC_KEY_PASSWORD: password, CSC_LINK: certificate }
        : {}),
    }
  }

  say(
    "Apple notarization is not configured: the macOS build is neither signed nor notarized."
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

async function fetchAgent(version: string, vault: Bucket): Promise<void> {
  mkdirSync(AGENT_DIST, { recursive: true })

  for (const file of [
    ...ARCHES.map((arch) => `pupitred-linux-${arch}`),
    "release.json",
  ]) {
    await get(vault, keys.agent(version, file), path.join(AGENT_DIST, file))
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

async function stage(
  system: System,
  version: string,
  vault: Bucket
): Promise<void> {
  const files = publishable(
    system,
    vault.dryRun ? [] : readdirSync(DESKTOP_DIST)
  )

  if (files.length === 0 && !vault.dryRun) {
    throw new Error(
      `${DESKTOP_DIST} holds nothing publishable: the build produced no installer.`
    )
  }

  const index = path.join(DESKTOP_DIST, WORK_INDEX)

  if (!vault.dryRun) {
    writeFileSync(index, `${JSON.stringify(files, null, 2)}\n`)
  }

  for (const file of files) {
    await put(
      vault,
      keys.work(version, system, file),
      path.join(DESKTOP_DIST, file)
    )
  }

  await put(vault, keys.work(version, system, WORK_INDEX), index)
  say(`${system}: ${files.length} files staged for ${version}`)
}

export async function desktopCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const dryRun = hasFlag(argv, "dry-run")
  const version = variable(env, "version")
  const vault = bucket(variable(env, "agentBucket"), env, dryRun)

  const system = systemOfHost(process.platform)

  await fetchAgent(version, vault)
  build(system, env, dryRun)
  await stage(system, version, vault)
}
