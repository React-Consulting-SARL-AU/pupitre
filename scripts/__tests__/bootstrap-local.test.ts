import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  apply,
  GENERATED,
  isUsableDatabaseUrl,
  localValues,
  needsNeonRefresh,
  neonTargetFor,
  parse,
  slugify,
  stripeWebhookSecret,
  stripJsonComments,
  wranglerVars,
} from "../bootstrap-local"

const WRANGLER = [
  "{",
  "  // Valeurs locales du développement.",
  '  "name": "ppt-web",',
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

const NEON = {
  branch: "staging",
  projectId: "royal-morning-15862824",
}

const WRITTEN = {
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/db",
  MIGRATE_DATABASE_URL: "postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db",
  NEON_BRANCH: "staging",
  NEON_PROJECT_ID: "royal-morning-15862824",
}

describe("slugify", () => {
  test("réduit une branche Git à ce qu'une branche Neon accepte", () => {
    expect(slugify("feat/écran_d'inspection")).toBe("feat-cran-d-inspection")
  })

  test("ne laisse jamais un tiret aux extrémités", () => {
    expect(slugify("--wip--")).toBe("wip")
  })
})

describe("neonTargetFor", () => {
  test("main travaille sur la branche partagée, qui existe déjà", () => {
    expect(neonTargetFor("main")).toEqual({
      branch: "staging",
      parent: null,
      expiresAt: null,
    })
  })

  test("une branche détachée retombe sur la branche partagée", () => {
    expect(neonTargetFor("").branch).toBe("staging")
  })

  test("toute autre branche obtient la sienne, tirée de la partagée", () => {
    const now = new Date("2026-09-06T00:00:00.000Z")
    const target = neonTargetFor("feat/us-east", now)

    expect(target.branch).toBe("dev/feat-us-east")
    expect(target.parent).toBe("staging")
    expect(target.expiresAt).toBe("2026-09-20T00:00:00.000Z")
  })
})

describe("isUsableDatabaseUrl", () => {
  test("reconnaît une URL Postgres écrite", () => {
    expect(isUsableDatabaseUrl(WRITTEN.DATABASE_URL)).toBe(true)
  })

  test("refuse le vide et le gabarit à remplir", () => {
    expect(isUsableDatabaseUrl(undefined)).toBe(false)
    expect(isUsableDatabaseUrl("")).toBe(false)
    expect(isUsableDatabaseUrl("postgresql://<user>:<pass>@host/db")).toBe(
      false
    )
  })
})

describe("needsNeonRefresh", () => {
  test("ne redemande rien quand la provenance concorde", () => {
    expect(needsNeonRefresh(WRITTEN, NEON)).toBe(false)
  })

  test("redemande tout quand le projet a changé — une base déplacée de région", () => {
    expect(
      needsNeonRefresh(WRITTEN, { ...NEON, projectId: "autre-projet" })
    ).toBe(true)
  })

  test("redemande tout quand la branche Git a changé", () => {
    expect(needsNeonRefresh(WRITTEN, { ...NEON, branch: "dev/feat-x" })).toBe(
      true
    )
  })

  test("redemande tout quand une URL manque, même l'URL de migration", () => {
    expect(
      needsNeonRefresh({ ...WRITTEN, MIGRATE_DATABASE_URL: "" }, NEON)
    ).toBe(true)
  })

  test("redemande tout quand le fichier ne dit pas d'où viennent ses URL", () => {
    expect(
      needsNeonRefresh(
        {
          DATABASE_URL: WRITTEN.DATABASE_URL,
          MIGRATE_DATABASE_URL: WRITTEN.MIGRATE_DATABASE_URL,
        },
        NEON
      )
    ).toBe(true)
  })
})

describe("les valeurs tirées au hasard", () => {
  const template = readFileSync(
    join(import.meta.dir, "..", "..", ".env.1password.tpl"),
    "utf8"
  )

  test("ne sont jamais partagées par 1Password", () => {
    // Le coffre est appliqué avant le tirage : une clé présente des deux côtés
    // serait remplacée par celle du poste, et deux machines ne parleraient plus
    // du même secret sans que rien ne le dise.
    for (const key of GENERATED) {
      expect(template).not.toContain(`${key}="op://`)
    }
  })
})
