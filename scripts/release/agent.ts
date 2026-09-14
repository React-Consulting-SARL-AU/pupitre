import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { arch as hostArch, platform as hostPlatform } from "node:os"
import path from "node:path"
import { PROTOCOL_VERSION } from "../../packages/shared/src/agent-protocol/envelope"
import { hasFlag, say, variable } from "./cli"
import {
  type AgentPublication,
  declareAgent,
  platformFromEnv,
} from "./platform"
import { type Bucket, bucket, get, keys, put } from "./r2"
import { run } from "./shell"

/**
 * The agent: one static binary per architecture, obfuscated, signed with the
 * release key, then kept in the private bucket with the manifest the app
 * embeds and the rows the platform is told.
 *
 * A version is built once. garble does not reproduce a binary, so a second
 * build would carry other digests than the ones the platform already holds:
 * when the bucket has the version, the build step takes it from there.
 */

const ROOT = path.resolve(import.meta.dir, "../..")

export const AGENT_DIR = path.join(ROOT, "apps/agent")

export const AGENT_DIST = path.join(AGENT_DIR, "dist/release")

export const ARCHES = ["amd64", "arm64"] as const

export const AGENT_FILES = [
  ...ARCHES.map((arch) => `pupitred-linux-${arch}`),
  "release.json",
  "publications.json",
]

/** Above this, garble left something readable behind. */
const READABLE_LIMIT = 10

const NEEDLE = Buffer.from("pupitre")

export function readableOccurrences(binary: Buffer): number {
  let count = 0
  let at = binary.indexOf(NEEDLE)

  while (at !== -1) {
    count += 1
    at = binary.indexOf(NEEDLE, at + NEEDLE.length)
  }

  return count
}

function binaryPath(arch: string): string {
  return path.join(AGENT_DIST, `pupitred-linux-${arch}`)
}

/**
 * The host runs what it built when it is that machine — Linux, same
 * architecture. A Mac runs it through Docker. A Linux host of the other
 * architecture runs nothing: a binary under emulation proves nothing, and
 * the other architecture has its own runner for that.
 */
function runner(arch: string): ((argv: string[]) => string) | null {
  const host = hostArch() === "x64" ? "amd64" : hostArch()

  if (hostPlatform() === "linux") {
    return host === arch ? (argv) => run(argv, { capture: true }) : null
  }

  if (spawnSync("docker", ["version"], { stdio: "ignore" }).status !== 0) {
    return null
  }

  return (argv) =>
    run(
      [
        "docker",
        "run",
        "--rm",
        `--platform=linux/${arch}`,
        "-v",
        `${AGENT_DIST}:/dist:ro`,
        "alpine:3.20",
        ...argv.map((one) => one.replace(AGENT_DIST, "/dist")),
      ],
      { capture: true }
    )
}

function smoke(version: string, publicKey: string): void {
  for (const arch of ARCHES) {
    const binary = binaryPath(arch)
    const bytes = readFileSync(binary)
    const readable = readableOccurrences(bytes)

    say(`${binary}: ${readable} readable occurrences of the name`)

    if (readable > READABLE_LIMIT) {
      throw new Error(`${binary} is not obfuscated enough.`)
    }

    if (!bytes.includes(publicKey)) {
      throw new Error(
        `${binary} does not carry the release public key: it could never be updated.`
      )
    }

    const exec = runner(arch)

    if (!exec) {
      say(`${binary}: not run here (${hostPlatform()}/${hostArch()})`)

      continue
    }

    chmodSync(binary, 0o755)

    const said = exec([binary, "version"]).trim()

    if (said !== `pupitred ${version}`) {
      throw new Error(
        `${binary} says "${said}", expected "pupitred ${version}".`
      )
    }

    const hello = exec(["sh", "-c", `echo '${HELLO}' | ${binary} serve`])

    if (!hello.includes('"ok":true')) {
      throw new Error(`${binary} does not answer hello.`)
    }
  }
}

const HELLO = JSON.stringify({
  id: 1,
  cmd: "hello",
  params: { app_version: "0.0.0", protocol: PROTOCOL_VERSION },
})

async function alreadyBuilt(version: string, vault: Bucket): Promise<boolean> {
  if (!vault.client) {
    return false
  }

  return await vault.client.exists(keys.agent(version, "publications.json"))
}

async function takeBuilt(version: string, vault: Bucket): Promise<void> {
  mkdirSync(AGENT_DIST, { recursive: true })

  for (const file of AGENT_FILES) {
    await get(vault, keys.agent(version, file), path.join(AGENT_DIST, file))
  }
}

export async function buildAgent(
  env: NodeJS.ProcessEnv,
  dryRun: boolean
): Promise<void> {
  const version = variable(env, "version")
  const vault = bucket(variable(env, "agentBucket"), env, dryRun)

  if (await alreadyBuilt(version, vault)) {
    say(
      `agent ${version} is already built: taken from ${vault.name}, not rebuilt`
    )
    await takeBuilt(version, vault)

    return
  }

  run(["bun", "run", "garble:install"], { cwd: AGENT_DIR, dryRun })
  run(["bun", "run", "release"], { cwd: AGENT_DIR, dryRun })

  if (dryRun) {
    return
  }

  for (const file of AGENT_FILES) {
    if (!existsSync(path.join(AGENT_DIST, file))) {
      throw new Error(`${file} was not produced by the agent build.`)
    }
  }

  smokeAgent(env)
}

/** The binaries in place, tried on this machine: what it can run, it runs; the rest is another runner's. */
export function smokeAgent(env: NodeJS.ProcessEnv): void {
  const publicKey = run(["go", "run", "./tools/release", "public-key"], {
    capture: true,
    cwd: AGENT_DIR,
  }).trim()

  smoke(variable(env, "version"), publicKey)
}

export function readAgentPublications(file: string): AgentPublication[] {
  const publications = JSON.parse(
    readFileSync(file, "utf8")
  ) as AgentPublication[]

  if (!Array.isArray(publications) || publications.length === 0) {
    throw new Error(`${file} declares no binary.`)
  }

  return publications
}

/** The bucket first: the platform hands out a signed URL as soon as the row exists. */
export async function publishAgent(
  env: NodeJS.ProcessEnv,
  dryRun: boolean
): Promise<void> {
  const version = variable(env, "version")
  const vault = bucket(variable(env, "agentBucket"), env, dryRun)
  const platform = platformFromEnv(variable(env, "platform"), env, dryRun)

  for (const file of AGENT_FILES) {
    await put(vault, keys.agent(version, file), path.join(AGENT_DIST, file))
  }

  const declarations = path.join(AGENT_DIST, "publications.json")

  for (const publication of dryRun && !existsSync(declarations)
    ? []
    : readAgentPublications(declarations)) {
    await declareAgent(platform, publication)
  }

  say(`agent ${version} published to ${platform.url}`)
}

export async function agentCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const dryRun = hasFlag(argv, "dry-run")
  const step = argv.find((value) => !value.startsWith("--"))

  switch (step) {
    case "build":
      await buildAgent(env, dryRun)
      return
    case "smoke":
      smokeAgent(env)
      return
    case "publish":
      await publishAgent(env, dryRun)
      return
    default:
      throw new Error("usage: release agent <build|smoke|publish> [--dry-run]")
  }
}
