import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  ESCAPE_VARIABLE,
  isEscaped,
  parsePushRefs,
  refusedPushRefs,
  refusesCommit,
} from "../assert-branch-writable"

const SCRIPT = path.resolve(import.meta.dir, "../assert-branch-writable.ts")

function push(input: string, env: Record<string, string> = {}) {
  return spawnSync("bun", [SCRIPT, "push"], {
    encoding: "utf8",
    input,
    env: { ...process.env, [ESCAPE_VARIABLE]: "", ...env },
  })
}

describe("commits", () => {
  test("refuses the production branch", () => {
    expect(refusesCommit("main")).toBe(true)
    expect(refusesCommit("main\n")).toBe(true)
  })

  test("lets every other branch through", () => {
    for (const branch of [
      "staging",
      "feat/PLT-30",
      "release/v0.2.0",
      "mainly",
    ]) {
      expect(refusesCommit(branch)).toBe(false)
    }
  })
})

describe("pushes", () => {
  const sha = "9f1c0d4a2b6e8f3c5d7a9b1c3e5f7a9b1c3e5f7a"

  test("reads the four fields git writes on stdin", () => {
    expect(
      parsePushRefs(`refs/heads/staging ${sha} refs/heads/staging ${sha}\n`)
    ).toEqual([
      { localRef: "refs/heads/staging", remoteRef: "refs/heads/staging" },
    ])
  })

  test("refuses a push that targets the production branch", () => {
    expect(
      refusedPushRefs(`refs/heads/main ${sha} refs/heads/main ${sha}`)
    ).toEqual(["refs/heads/main"])
  })

  test("refuses a deletion of the production branch", () => {
    expect(
      refusedPushRefs(`(delete) ${"0".repeat(40)} refs/heads/main ${sha}`)
    ).toEqual(["refs/heads/main"])
  })

  test("refuses a local branch pushed onto the production branch", () => {
    expect(
      refusedPushRefs(`refs/heads/staging ${sha} refs/heads/main ${sha}`)
    ).toEqual(["refs/heads/main"])
  })

  test("lets the integration branch and tags through", () => {
    expect(
      refusedPushRefs(
        [
          `refs/heads/staging ${sha} refs/heads/staging ${sha}`,
          `refs/tags/v0.2.0 ${sha} refs/tags/v0.2.0 ${sha}`,
        ].join("\n")
      )
    ).toEqual([])
  })

  test("survives an empty stdin", () => {
    expect(refusedPushRefs("")).toEqual([])
  })
})

describe("the escape hatch", () => {
  test("only opens on exactly 1", () => {
    expect(isEscaped({ [ESCAPE_VARIABLE]: "1" })).toBe(true)
    expect(isEscaped({ [ESCAPE_VARIABLE]: "true" })).toBe(false)
    expect(isEscaped({})).toBe(false)
  })
})

describe("the command", () => {
  const sha = "9f1c0d4a2b6e8f3c5d7a9b1c3e5f7a9b1c3e5f7a"
  const line = `refs/heads/main ${sha} refs/heads/main ${sha}`

  test("exits non-zero and names the pull request", () => {
    const result = push(line)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Push refused")
    expect(result.stderr).toContain("gh pr create")
  })

  test("exits zero once the escape hatch is set", () => {
    expect(push(line, { [ESCAPE_VARIABLE]: "1" }).status).toBe(0)
  })

  test("refuses an unknown mode", () => {
    const result = spawnSync("bun", [SCRIPT, "rebase"], {
      encoding: "utf8",
      input: "",
      env: { ...process.env, [ESCAPE_VARIABLE]: "" },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Unknown mode")
  })
})
