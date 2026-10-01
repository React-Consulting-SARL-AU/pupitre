import { beforeAll, describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const CONSOLE_ROOT = path.resolve(import.meta.dir, "..")
const CLIENT_DIR = path.join(CONSOLE_ROOT, "dist", "client")
const SERVER_DIR = path.join(CONSOLE_ROOT, "dist", "server")
const BUILD_TIMEOUT_MS = 300_000
const CHUNKS_AT_LEAST = 10

// Checks on the built output that `createIsomorphicFn` really drops server-only imports.
const SERVER_ONLY = [
  { tell: "a Node builtin", re: /["'`]node:[a-z_/]+["'`]/ },
  { tell: "the Workers runtime", re: /["'`]cloudflare:[a-z]+["'`]/ },
  { tell: "the request of TanStack Start", re: /getRequestHeader/ },
  { tell: "the server branch of readLocale", re: /accept-language/ },
  { tell: "the Prisma client", re: /PrismaClient/ },
  { tell: "the server's async local storage", re: /AsyncLocalStorage/ },
]

function chunks(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      chunks(full, out)
    } else if (entry.name.endsWith(".js")) {
      out.push(full)
    }
  }

  return out
}

function build(): void {
  const result = spawnSync("bun", ["run", "build"], {
    cwd: CONSOLE_ROOT,
    encoding: "utf8",
  })

  if (result.status !== 0) {
    throw new Error(
      `the console did not build:\n${result.stderr}\n${result.stdout}`
    )
  }
}

describe("the client bundle", () => {
  beforeAll(build, BUILD_TIMEOUT_MS)

  it("comes out of the build", () => {
    expect(chunks(CLIENT_DIR).length).toBeGreaterThan(CHUNKS_AT_LEAST)
  })

  it("contains no server module", () => {
    const offenders: string[] = []

    for (const file of chunks(CLIENT_DIR)) {
      const code = readFileSync(file, "utf8")

      for (const { tell, re } of SERVER_ONLY) {
        if (re.test(code)) {
          offenders.push(`${path.relative(CONSOLE_ROOT, file)} carries ${tell}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it("looks for traces that the server bundle really carries", () => {
    const server = chunks(SERVER_DIR).map((file) => readFileSync(file, "utf8"))
    const unseen = SERVER_ONLY.filter(
      ({ re }) => !server.some((code) => re.test(code))
    ).map(({ tell }) => tell)

    expect(unseen).toEqual([])
  })
})
