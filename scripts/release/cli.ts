/**
 * What every step reads from its command line and its environment.
 *
 * A step never asks a question: what it needs is a flag or a variable, and a
 * value that is missing stops it with the name of what to set. `--dry-run`
 * prints every command and every request instead of running it, which is how a
 * step is tried on a workstation without a bucket or a platform in reach.
 */

export const VARIABLES = {
  version: "PUPITRE_RELEASE_VERSION",
  channel: "PUPITRE_RELEASE_CHANNEL",
  platform: "PUPITRE_PLATFORM_URL",
  stagingPlatform: "PUPITRE_STAGING_PLATFORM_URL",
  downloadsUrl: "PUPITRE_DOWNLOADS_URL",
  downloadsBucket: "PUPITRE_DOWNLOADS_BUCKET",
  agentBucket: "PUPITRE_R2_BUCKET",
  publishToken: "PUPITRE_PUBLISH_TOKEN",
  privateKey: "PUPITRE_RELEASE_PRIVATE_KEY",
} as const

export function argumentOf(
  argv: readonly string[],
  name: string
): string | undefined {
  const flag = `--${name}=`
  const found = argv.find((value) => value.startsWith(flag))

  return found?.slice(flag.length)
}

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

export function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set: the step cannot continue.`)
  }

  return value
}

export function variable(
  env: NodeJS.ProcessEnv,
  key: keyof typeof VARIABLES
): string {
  return required(VARIABLES[key], env[VARIABLES[key]])
}

export function say(line: string): void {
  process.stdout.write(`${line}\n`)
}
