import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { collectFindings } from "../assert-package-boundaries"

const SCRIPT = path.resolve(import.meta.dir, "../assert-package-boundaries.ts")

const roots: string[] = []

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "pupitre-boundaries-"))
  roots.push(root)

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }

  return root
}

function reasons(root: string): string[] {
  return collectFindings(root).map((f) => `${f.file} ${f.spec} ${f.reason}`)
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("clean trees", () => {
  test("an empty repository has no finding", () => {
    expect(collectFindings(fixture({}))).toEqual([])
  })

  test("apps consuming packages through public entrypoints pass", () => {
    const root = fixture({
      "apps/web/src/a.ts": [
        'import { api } from "@pupitre/api/server"',
        'import { auth } from "@pupitre/auth"',
        'import { db } from "@pupitre/db/cloudflare/client"',
        'import type { User } from "@pupitre/db/client"',
        'import { plans } from "@pupitre/shared/plans"',
        "export { api, auth, db, plans, type User }",
      ].join("\n"),
      "apps/desktop/src/a.ts": [
        'import { db } from "@pupitre/db/client"',
        'import { protocol } from "@pupitre/shared/agent-protocol"',
        "export { db, protocol }",
      ].join("\n"),
      "packages/api/src/a.ts": [
        'import { guard } from "@pupitre/api/lib/guards"',
        'import { db } from "@pupitre/db/cloudflare/client"',
        "export { db, guard }",
      ].join("\n"),
    })

    expect(collectFindings(root)).toEqual([])
  })
})

describe("apps do not import other apps", () => {
  test("a package specifier of a sibling app is refused", () => {
    const root = fixture({
      "apps/web/src/a.ts":
        'import { x } from "@pupitre/desktop/src/x"\nexport { x }',
    })

    expect(reasons(root)).toEqual([
      "apps/web/src/a.ts @pupitre/desktop/src/x imports the sibling app `apps/desktop`",
    ])
  })

  test("a relative path reaching a sibling app is refused", () => {
    const root = fixture({
      "apps/desktop/src/a.ts":
        'import { x } from "../../web/src/x"\nexport { x }',
      "apps/web/src/x.ts": "export const x = 1",
    })

    expect(reasons(root)).toEqual([
      "apps/desktop/src/a.ts ../../web/src/x reaches into `apps/web` via a relative path",
    ])
  })

  test("an app importing its own package name passes", () => {
    const root = fixture({
      "apps/web/src/a.ts": 'import { x } from "@pupitre/web/x"\nexport { x }',
    })

    expect(collectFindings(root)).toEqual([])
  })
})

describe("@pupitre/api/lib is private to packages/api", () => {
  test("an app deep-importing the api package is refused", () => {
    const root = fixture({
      "apps/web/src/a.ts":
        'import { g } from "@pupitre/api/lib/guards"\nexport { g }',
    })

    expect(reasons(root)).toEqual([
      "apps/web/src/a.ts @pupitre/api/lib/guards deep-imports `@pupitre/api/lib` — use `./server`, `./client` or `./testing`",
    ])
  })

  test("another package deep-importing the api package is refused", () => {
    const root = fixture({
      "packages/auth/src/a.ts":
        'import { g } from "@pupitre/api/lib/guards"\nexport { g }',
    })

    expect(reasons(root)).toEqual([
      "packages/auth/src/a.ts @pupitre/api/lib/guards deep-imports `@pupitre/api/lib` — use `./server`, `./client` or `./testing`",
    ])
  })
})

describe("Node Prisma entrypoints stay out of edge code", () => {
  test("a value import in apps/web/src is refused", () => {
    const root = fixture({
      "apps/web/src/a.ts":
        'import { db } from "@pupitre/db/client"\nexport { db }',
    })

    expect(reasons(root)).toEqual([
      "apps/web/src/a.ts @pupitre/db/client bundles the Node Prisma client into edge code — import `@pupitre/db/cloudflare/client` instead (or make it `import type`)",
    ])
  })

  test("enums and models entrypoints are refused in packages/api/src", () => {
    const root = fixture({
      "packages/api/src/a.ts": [
        'import { Role } from "@pupitre/db/enums"',
        'import { User } from "@pupitre/db/models"',
        "export { Role, User }",
      ].join("\n"),
    })

    expect(reasons(root)).toEqual([
      "packages/api/src/a.ts @pupitre/db/enums bundles the Node Prisma client into edge code — import `@pupitre/db/cloudflare/enums` instead (or make it `import type`)",
      "packages/api/src/a.ts @pupitre/db/models bundles the Node Prisma client into edge code — import `@pupitre/db/cloudflare/models` instead (or make it `import type`)",
    ])
  })

  test("type-only imports pass", () => {
    const root = fixture({
      "apps/web/src/a.ts": [
        'import type { User } from "@pupitre/db/client"',
        'import { type Role, type Plan } from "@pupitre/db/enums"',
        "export type { Plan, Role, User }",
      ].join("\n"),
    })

    expect(collectFindings(root)).toEqual([])
  })

  test("tests and tooling inside edge roots pass", () => {
    const root = fixture({
      "apps/web/src/a.test.ts":
        'import { db } from "@pupitre/db/client"\nexport { db }',
      "packages/api/src/testing/harness.ts":
        'import { db } from "@pupitre/db/client"\nexport { db }',
    })

    expect(collectFindings(root)).toEqual([])
  })
})

describe("apps/agent depends on no TypeScript package", () => {
  test("a @pupitre specifier is refused", () => {
    const root = fixture({
      "apps/agent/tools/export.ts":
        'import { schema } from "@pupitre/shared"\nexport { schema }',
    })

    expect(reasons(root)).toEqual([
      "apps/agent/tools/export.ts @pupitre/shared imports a TypeScript package from `apps/agent` — consume the exported JSON Schema instead",
    ])
  })

  test("a relative path into packages/ is refused", () => {
    const root = fixture({
      "apps/agent/tools/export.ts":
        'import { schema } from "../../../packages/shared/src"\nexport { schema }',
      "packages/shared/src/index.ts": "export const schema = {}",
    })

    expect(reasons(root)).toEqual([
      "apps/agent/tools/export.ts ../../../packages/shared/src reaches into `packages/` from `apps/agent` — consume the exported JSON Schema instead",
    ])
  })
})

describe("packages do not import apps", () => {
  test("a package importing an app package is refused", () => {
    const root = fixture({
      "packages/shared/src/a.ts":
        'import { x } from "@pupitre/web/x"\nexport { x }',
    })

    expect(reasons(root)).toEqual([
      "packages/shared/src/a.ts @pupitre/web/x imports the application `apps/web`",
    ])
  })

  test("a package reaching apps/ through a relative path is refused", () => {
    const root = fixture({
      "packages/shared/src/a.ts":
        'import { x } from "../../../apps/web/src/x"\nexport { x }',
    })

    expect(reasons(root)).toEqual([
      "packages/shared/src/a.ts ../../../apps/web/src/x reaches into apps/ via a relative path",
    ])
  })
})

describe("command line", () => {
  test("exits 0 on a clean tree", () => {
    const root = fixture({ "packages/shared/src/a.ts": "export const a = 1" })
    const result = spawnSync("bun", [SCRIPT], { cwd: root })

    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toContain("Package boundaries OK")
  })

  test("exits 1 and names the offending import", () => {
    const root = fixture({
      "apps/web/src/a.ts": 'import { x } from "@pupitre/desktop"\nexport { x }',
    })
    const result = spawnSync("bun", [SCRIPT], { cwd: root })

    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toContain("apps/web/src/a.ts")
    expect(result.stderr.toString()).toContain("@pupitre/desktop")
  })
})
