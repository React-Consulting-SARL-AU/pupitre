import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  apply,
  GENERATED,
  localValues,
  parse,
  stripeWebhookSecret,
  stripJsonComments,
  wranglerVars,
} from "../bootstrap-local"

const WRANGLER = [
  "{",
  "  // Local development values.",
  '  "name": "ppt-web",',
  "  /* the Worker reads these three */",
  '  "vars": {',
  '    "BETTER_AUTH_URL": "http://localhost:3000",',
  '    "VITE_APP_URL": "http://localhost:3000",',
  '    "EMAIL_FROM": "no-reply@pupitre.studio"',
  "  }",
  "}",
].join("\n")

function withWrangler<T>(content: string, run: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-bootstrap-"))
  const path = join(dir, "wrangler.jsonc")

  writeFileSync(path, content)

  try {
    return run(path)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

describe("stripJsonComments", () => {
  test("keeps the `//` that are inside a string", () => {
    expect(
      JSON.parse(stripJsonComments('{ "url": "http://localhost:3000" } // end'))
    ).toEqual({ url: "http://localhost:3000" })
  })

  test("strips block comments", () => {
    expect(JSON.parse(stripJsonComments('{ /* note */ "a": 1 }'))).toEqual({
      a: 1,
    })
  })
})

describe("wranglerVars", () => {
  test("returns the file's non-empty vars", () => {
    expect(withWrangler(WRANGLER, wranglerVars)).toEqual({
      BETTER_AUTH_URL: "http://localhost:3000",
      VITE_APP_URL: "http://localhost:3000",
      EMAIL_FROM: "no-reply@pupitre.studio",
    })
  })

  test("returns an empty object when the file is missing", () => {
    expect(wranglerVars(join(tmpdir(), "absent-wrangler.jsonc"))).toEqual({})
  })
})

describe("localValues", () => {
  const defaults = {
    BETTER_AUTH_URL: "http://localhost:3000",
    EMAIL_FROM: "no-reply@pupitre.studio",
  }

  test("fills a key that is declared but empty", () => {
    expect(localValues({ BETTER_AUTH_URL: "" }, defaults)).toEqual(defaults)
  })

  test("never replaces a value that is already written", () => {
    expect(
      localValues({ BETTER_AUTH_URL: "http://127.0.0.1:3000" }, defaults)
    ).toEqual({ EMAIL_FROM: "no-reply@pupitre.studio" })
  })
})

test("an empty .env.local comes out with the local values", () => {
  const base = ['BETTER_AUTH_URL=""', 'VITE_APP_URL=""'].join("\n")
  const written = apply(
    base,
    localValues(parse(base), {
      BETTER_AUTH_URL: "http://localhost:3000",
      VITE_APP_URL: "http://localhost:3000",
    })
  )

  expect(parse(written)).toEqual({
    BETTER_AUTH_URL: "http://localhost:3000",
    VITE_APP_URL: "http://localhost:3000",
  })
})

describe("stripeWebhookSecret", () => {
  const runner =
    (replies: Record<string, { status: number; stdout?: string }>) =>
    (args: string[]) =>
      replies[args[0]] ?? { status: 1 }

  test("takes the secret the CLI holds for this account", () => {
    const values = stripeWebhookSecret(
      runner({
        "--version": { status: 0 },
        listen: {
          status: 0,
          stdout: "Ready! Your webhook signing secret is\nwhsec_abc123\n",
        },
      })
    )

    expect(values).toEqual({ STRIPE_WEBHOOK_SECRET: "whsec_abc123" })
  })

  test("blocks nothing when the CLI is missing or has no session", () => {
    expect(stripeWebhookSecret(runner({}))).toEqual({})
    expect(stripeWebhookSecret(runner({ "--version": { status: 0 } }))).toEqual(
      {}
    )
  })

  test("does not invent a secret when the output carries none", () => {
    const values = stripeWebhookSecret(
      runner({
        "--version": { status: 0 },
        listen: {
          status: 0,
          stdout: "A newer version of the Stripe CLI is available.\n",
        },
      })
    )

    expect(values).toEqual({})
  })
})

describe("randomly drawn values", () => {
  const template = readFileSync(
    join(import.meta.dir, "..", "..", ".env.1password.tpl"),
    "utf8"
  )

  test("are never shared through 1Password", () => {
    // The vault wins over the draw, or two machines would silently hold different secrets.
    for (const key of GENERATED) {
      expect(template).not.toContain(`${key}="op://`)
    }
  })
})
