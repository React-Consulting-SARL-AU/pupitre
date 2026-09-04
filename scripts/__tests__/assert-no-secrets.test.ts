import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { findSecrets } from "../assert-no-secrets"

const SCRIPT = path.resolve(import.meta.dir, "../assert-no-secrets.ts")

const dirs: string[] = []

function tempFile(name: string, content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pupitre-secrets-"))
  dirs.push(dir)

  const file = path.join(dir, name)
  writeFileSync(file, content)

  return file
}

function kinds(content: string): string[] {
  return findSecrets(content, "sample.ts").map((f) => f.kind)
}

const ALNUM = "4eC39HqLyjWDarjtT1zdp7dc8Kf2Qm5Z"
const samples = {
  privateKey: ["-----BEGIN", "RSA PRIVATE", "KEY-----"].join(" "),
  opensshKey: ["-----BEGIN", "OPENSSH PRIVATE", "KEY-----"].join(" "),
  stripeLive: ["sk", "live", ALNUM].join("_"),
  stripeTest: ["sk", "test", ALNUM].join("_"),
  stripeWebhook: ["whsec", ALNUM].join("_"),
  githubToken: ["ghp", `${ALNUM}${ALNUM}`].join("_"),
  githubPat: ["github", "pat", `${ALNUM}${ALNUM}`].join("_"),
  aws: ["AKIA", "IOSFODNN7EXAMPLE"].join(""),
  slack: ["xoxb", "123456789012", `${ALNUM}`].join("-"),
  google: ["AIza", "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8s"].join(""),
  anthropic: ["sk", "ant", "api03", `${ALNUM}${ALNUM}`].join("-"),
  jwt: [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  ].join("."),
  postgresUrl: [
    "postgresql://app",
    `${ALNUM}@ep-quiet-sea.eu-central-1.aws.neon.tech/db`,
  ].join(":"),
  quotedAssignment: `const apiKey = "${ALNUM}"`,
  envAssignment: `STRIPE_WEBHOOK_SECRET=${ALNUM}`,
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("secret-like strings are found", () => {
  test.each([
    ["privateKey", "private key"],
    ["opensshKey", "private key"],
    ["stripeLive", "Stripe secret key"],
    ["stripeTest", "Stripe secret key"],
    ["stripeWebhook", "Stripe webhook secret"],
    ["githubToken", "GitHub token"],
    ["githubPat", "GitHub token"],
    ["aws", "AWS access key id"],
    ["slack", "Slack token"],
    ["google", "Google API key"],
    ["anthropic", "Anthropic API key"],
    ["jwt", "JSON Web Token"],
    ["postgresUrl", "database URL with password"],
    ["quotedAssignment", "credential assigned in source"],
    ["envAssignment", "credential assigned in an env file"],
  ] as const)("%s is reported as %s", (sample, kind) => {
    expect(kinds(`${samples[sample]}\n`)).toContain(kind)
  })

  test("the line number of the finding is reported", () => {
    const content = `const a = 1\nconst b = 2\nconst c = "${samples.stripeLive}"\n`
    const [finding] = findSecrets(content, "src/a.ts")

    expect(finding).toMatchObject({ file: "src/a.ts", line: 3 })
  })
})

describe("ordinary sources pass", () => {
  test("code that reads secrets from the environment is clean", () => {
    const content = [
      'const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? ""',
      "const token = await getToken()",
      'const password = ""',
      'const placeholder = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"',
      "export { password, placeholder, stripeSecretKey, token }",
    ].join("\n")

    expect(findSecrets(content, "src/a.ts")).toEqual([])
  })

  test("an env example with empty values is clean", () => {
    const content = [
      'DATABASE_URL=""',
      'BETTER_AUTH_SECRET=""',
      'STRIPE_SECRET_KEY=""',
      "STRIPE_WEBHOOK_SECRET=",
    ].join("\n")

    expect(findSecrets(content, ".env.example")).toEqual([])
  })

  test("a database URL with a short placeholder password is clean", () => {
    const content =
      'DATABASE_URL="postgresql://user:pass@localhost:5432/pupitre"'

    expect(findSecrets(content, ".env.example")).toEqual([])
  })

  test("the scanner and its test scan clean", () => {
    expect(findSecrets(readFileSync(SCRIPT, "utf8"), SCRIPT)).toEqual([])
    expect(
      findSecrets(readFileSync(import.meta.path, "utf8"), import.meta.path)
    ).toEqual([])
  })

  test("binary content is skipped", () => {
    expect(findSecrets(`\u0000${samples.stripeLive}`, "logo.png")).toEqual([])
  })
})

describe("command line", () => {
  test("exits 0 without files", () => {
    const result = spawnSync("bun", [SCRIPT])

    expect(result.status).toBe(0)
  })

  test("exits 0 on a clean file and on a missing file", () => {
    const clean = tempFile("clean.ts", "export const a = 1\n")
    const result = spawnSync("bun", [
      SCRIPT,
      clean,
      path.join(path.dirname(clean), "missing.ts"),
    ])

    expect(result.status).toBe(0)
  })

  test("refuses a .ts file holding a secret-like string", () => {
    const file = tempFile(
      "leak.ts",
      `export const key = "${samples.stripeLive}"\n`
    )
    const result = spawnSync("bun", [SCRIPT, file])

    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toContain("leak.ts:1")
    expect(result.stderr.toString()).toContain("Stripe secret key")
  })

  test("accepts a private key header quoted inside a sentence", () => {
    const line = [
      "> `-----BEGIN",
      "OPENSSH PRIVATE",
      "KEY-----`, you have the wrong file",
    ].join(" ")

    expect(findSecrets(line, "docs/SETUP.md")).toEqual([])
  })

  test("refuses a .ts file holding a private key", () => {
    const file = tempFile(
      "key.ts",
      `export const pem = \`${samples.privateKey}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\`\n`
    )
    const result = spawnSync("bun", [SCRIPT, file])

    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toContain("private key")
  })
})

describe("test fixtures", () => {
  test("lets a test file hold a credential-shaped fixture", () => {
    const line = `const TOKEN = "6d1f0c2b9a4e8f7c5b3a1d0e9f8c7b6a"`

    expect(findSecrets(line, "src/emails/redaction.test.ts")).toEqual([])
    expect(findSecrets(line, "src/emails/redaction.ts")).not.toEqual([])
  })

  test("still refuses a real provider key inside a test", () => {
    const line = `const key = "${["sk", "live", "51H8kQ2eZvKYlo2CxxxxxxxxxxxA"].join("_")}"`

    expect(
      findSecrets(line, "src/billing/stripe.test.ts").length
    ).toBeGreaterThan(0)
  })
})

describe("go and data fixtures", () => {
  const line = ["postgres://app:", "h7Kd2m9Qp4Rx", "@127.0.0.1:5432/shop"].join(
    ""
  )

  test("lets a Go test hold a fixture connection string", () => {
    expect(findSecrets(line, "internal/tool/module_test.go")).toEqual([])
  })

  test("lets a transcript under testdata hold one", () => {
    expect(findSecrets(line, "internal/tool/testdata/secrets.jsonl")).toEqual(
      []
    )
  })

  test("still refuses one in ordinary Go source", () => {
    expect(findSecrets(line, "internal/tool/module.go")).not.toEqual([])
  })
})
