import { spawnSync } from "node:child_process"

// Commands are printed as run: secrets travel in the environment, never on a command line.
export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  dryRun?: boolean
  capture?: boolean
}

export function run(argv: readonly string[], options: RunOptions = {}): string {
  process.stdout.write(`$ ${argv.join(" ")}\n`)

  if (options.dryRun) {
    return ""
  }

  const result = spawnSync(argv[0] as string, argv.slice(1), {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${argv[0]} exited with ${result.status}`)
  }

  return result.stdout ?? ""
}
