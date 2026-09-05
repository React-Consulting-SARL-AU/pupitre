import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  apply,
  localValues,
  parse,
  stripeWebhookSecret,
  stripJsonComments,
  wranglerVars,
} from "../bootstrap-local"

const WRANGLER = [
  "{",
  "  // Valeurs locales du développement.",
  '  "name": "pupitre-web",',
  "  /* le Worker lit ces trois-là */",
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
  test("garde les `//` qui sont dans une chaîne", () => {
    expect(
      JSON.parse(stripJsonComments('{ "url": "http://localhost:3000" } // fin'))
    ).toEqual({ url: "http://localhost:3000" })
  })

  test("retire les commentaires de bloc", () => {
    expect(JSON.parse(stripJsonComments('{ /* note */ "a": 1 }'))).toEqual({
      a: 1,
    })
  })
})

describe("wranglerVars", () => {
  test("rend les vars non vides du fichier", () => {
    expect(withWrangler(WRANGLER, wranglerVars)).toEqual({
      BETTER_AUTH_URL: "http://localhost:3000",
      VITE_APP_URL: "http://localhost:3000",
      EMAIL_FROM: "no-reply@pupitre.studio",
    })
  })

  test("rend un objet vide quand le fichier manque", () => {
    expect(wranglerVars(join(tmpdir(), "absent-wrangler.jsonc"))).toEqual({})
  })
})

describe("localValues", () => {
  const defaults = {
    BETTER_AUTH_URL: "http://localhost:3000",
    EMAIL_FROM: "no-reply@pupitre.studio",
  }

  test("remplit une clé déclarée mais vide", () => {
    expect(localValues({ BETTER_AUTH_URL: "" }, defaults)).toEqual(defaults)
  })

  test("ne remplace jamais une valeur déjà écrite", () => {
    expect(
      localValues({ BETTER_AUTH_URL: "http://127.0.0.1:3000" }, defaults)
    ).toEqual({ EMAIL_FROM: "no-reply@pupitre.studio" })
  })
})

test("un .env.local vide ressort avec les valeurs locales", () => {
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

  test("prend le secret que le CLI tient pour ce compte", () => {
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

  test("ne bloque rien quand le CLI est absent ou sans session", () => {
    expect(stripeWebhookSecret(runner({}))).toEqual({})
    expect(stripeWebhookSecret(runner({ "--version": { status: 0 } }))).toEqual(
      {}
    )
  })

  test("n'invente pas un secret quand la sortie n'en porte aucun", () => {
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
