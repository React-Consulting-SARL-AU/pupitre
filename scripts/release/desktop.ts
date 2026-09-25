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
  installerOf,
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

/** What a build leaves for the publish step, for one system: its installers, what the updater fetches beside them, its feed. */
export function publishable(
  system: System,
  files: readonly string[]
): string[] {
  const ofSystem = (file: string) => artefactOf(file)?.os === system

  return files
    .filter(
      (file) =>
        ofSystem(installerOf(file)) ||
        (isFeed(file) && file === FEED_OF[system])
    )
    .sort()
}

const STABLE_CHANNEL = "stable"

const MAC_SIGNING = [
  "APPLE_API_KEY_CONTENT",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
] as const

/** The three names the build is given, the publisher electron-updater checks, and the Entra ID application Trusted Signing logs in with. */
const WINDOWS_SIGNING = [
  "AZURE_SIGNING_ENDPOINT",
  "AZURE_SIGNING_ACCOUNT",
  "AZURE_SIGNING_PROFILE",
  "AZURE_SIGNING_PUBLISHER",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
] as const

/**
 * What an installed app updates to is on the stable channel: it ships signed
 * or not at all. A beta build may go out unsigned, and says so.
 */
export function signingRequired(channel: string): boolean {
  return channel === STABLE_CHANNEL
}

/** Stopgap until Azure Trusted Signing exists: the release names it, and deleting that line restores the rule. */
export function windowsSigningRequired(
  channel: string,
  env: NodeJS.ProcessEnv
): boolean {
  return signingRequired(channel) && env.PUPITRE_ALLOW_UNSIGNED_WINDOWS !== "1"
}

function refuseUnsigned(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  system: string
): void {
  const missing = names.filter((name) => !env[name])

  if (missing.length > 0) {
    throw new Error(
      `the stable channel ships a signed ${system} app: ${missing.join(", ")} not set.`
    )
  }
}

/**
 * electron-builder skips signing with a word in its log when it finds no
 * identity; on the stable channel that is a failed build, not an unsigned one.
 */
export function enforcedSigning(system: System, required: boolean): string[] {
  if (!required || system === "linux") {
    return []
  }

  return [`-c.${system === "macos" ? "mac" : "win"}.forceCodeSigning=true`]
}

/**
 * macOS signs with the Developer ID certificate it is given — a bare runner
 * imports it into a throwaway keychain — or, without one, with the identity
 * of this Mac's keychain; and notarizes with the App Store Connect key, given
 * as a file for as long as the build lasts. Without the key, a beta build is
 * neither signed nor notarized, and says so; a stable one stops. Apple keeps
 * a notarization for minutes without a word: the debug output says where it
 * stands.
 */
export function macSigning(
  env: NodeJS.ProcessEnv,
  keyFile: (content: string) => string,
  required: boolean
): NodeJS.ProcessEnv {
  if (required) {
    refuseUnsigned(env, MAC_SIGNING, "macOS")
  }

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

/**
 * Windows signs through Azure Trusted Signing when its three names are given.
 * The publisher — the certificate's subject name, which Trusted Signing does
 * not report — goes into `app-update.yml`, and an installed app then refuses
 * an update whose Authenticode signer is anyone else.
 */
export function windowsSigning(
  env: NodeJS.ProcessEnv,
  required: boolean
): string[] {
  if (required) {
    refuseUnsigned(env, WINDOWS_SIGNING, "Windows")
  }

  const endpoint = env.AZURE_SIGNING_ENDPOINT
  const account = env.AZURE_SIGNING_ACCOUNT
  const profile = env.AZURE_SIGNING_PROFILE
  const publisher = env.AZURE_SIGNING_PUBLISHER

  if (endpoint && account && profile) {
    return [
      `-c.win.azureSignOptions.endpoint=${endpoint}`,
      `-c.win.azureSignOptions.codeSigningAccountName=${account}`,
      `-c.win.azureSignOptions.certificateProfileName=${profile}`,
      ...(publisher
        ? [`-c.win.azureSignOptions.publisherName=${publisher}`]
        : []),
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
  const channel = variable(env, "channel")
  const required = signingRequired(channel)
  const shared: NodeJS.ProcessEnv = {
    MAIN_VITE_UPDATE_CHANNEL: channel,
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
      const signing = macSigning(
        env,
        (content) => {
          const file = path.join(temp, "apple-api-key.p8")

          writeFileSync(file, Buffer.from(content, "base64"), { mode: 0o600 })

          return file
        },
        required
      )

      run(["bun", "run", "build:mac", ...enforcedSigning(system, required)], {
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
    const windowsRequired = windowsSigningRequired(channel, env)

    if (required && !windowsRequired) {
      say(
        "PUPITRE_ALLOW_UNSIGNED_WINDOWS is set: this stable Windows build may ship without Authenticode."
      )
    }

    run(
      [
        "bun",
        "run",
        "build:win",
        ...windowsSigning(env, windowsRequired),
        ...enforcedSigning(system, windowsRequired),
      ],
      { cwd: DESKTOP_DIR, dryRun, env: shared }
    )

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
