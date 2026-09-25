import { spawnSync } from "node:child_process"
import path from "node:path"

/** The D1 bindings and the migrations directory are configured in the console's wrangler config. */
export const WEB_DIR = path.resolve(import.meta.dir, "../../../apps/web")

export const DB_DIR = path.resolve(import.meta.dir, "..")

export const MIGRATIONS_DIR = path.join(DB_DIR, "migrations")

export const BINDING = "DB"

export function wrangler(
  args: string[],
  options: { capture?: boolean } = {}
): string {
  const result = spawnSync("bun", ["x", "wrangler", ...args], {
    cwd: WEB_DIR,
    encoding: "utf8",
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
  })

  if (result.status !== 0) {
    throw new Error(
      `wrangler ${args.slice(0, 3).join(" ")} exited with ${result.status}`
    )
  }

  return result.stdout ?? ""
}

export function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
