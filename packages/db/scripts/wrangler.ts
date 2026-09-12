import { spawnSync } from "node:child_process"
import path from "node:path"

/**
 * wrangler, against the console's configuration: that is where the D1
 * bindings live, and the migrations directory is named from there.
 */

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
