import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  environmentSecrets,
  parseBoundNames,
  parseWranglerConfig,
  readWranglerConfig,
  reportSecrets,
  stripJsonc,
  type TWranglerConfig,
  WorkerSecretsError,
} from "../check-worker-secrets"

const SCRIPT = path.resolve(import.meta.dir, "../check-worker-secrets.ts")
const UNKNOWN_ENVIRONMENT_RE = /preprod/

const WEB_CONFIG = path.resolve(
  import.meta.dir,
  "../../apps/web/wrangler.jsonc"
)

function run(
  args: string[],
  bound: string
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bun", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PUPITRE_WORKER_SECRETS: bound },
  })

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function fixture(): TWranglerConfig {
  return {
    name: "ppt-web",
    secrets: { required: ["DATABASE_URL"] },
    env: {
      staging: {
        vars: { PUPITRE_ENVIRONMENT: "staging" },
        secrets: { required: ["DATABASE_URL", "STRIPE_SECRET_KEY"] },
      },
      production: {
        vars: { PUPITRE_ENVIRONMENT: "production" },
      },
    },
  }
}

describe("the wrangler configuration is read as JSONC", () => {
  test("comments and a trailing comma are stripped", () => {
    const source = [
      "{",
      "  // the Worker",
      '  "name": "ppt-web", /* deployed name */',
      '  "url": "https://app.pupitre.studio",',
      "}",
    ].join("\n")

    expect(JSON.parse(stripJsonc(source))).toEqual({
      name: "ppt-web",
      url: "https://app.pupitre.studio",
    })
  })

  test("a comment marker inside a string survives", () => {
    const config = parseWranglerConfig('{"vars":{"URL":"https://a.b//c"}}')

    expect(config.vars?.URL).toBe("https://a.b//c")
  })

  test("the shipped configuration declares both environments", () => {
    const config = readWranglerConfig(WEB_CONFIG)

    expect(Object.keys(config.env ?? {}).sort()).toEqual([
      "production",
      "staging",
    ])
  })
})

describe("the required secrets of an environment", () => {
  test("the environment list wins over the top-level one", () => {
    const secrets = environmentSecrets(fixture(), "staging")

    expect(secrets.required).toEqual(["DATABASE_URL", "STRIPE_SECRET_KEY"])
    expect(secrets.workerName).toBe("ppt-web-staging")
  })

  test("an environment without a list inherits the top-level one", () => {
    expect(environmentSecrets(fixture(), "production").required).toEqual([
      "DATABASE_URL",
    ])
  })

  test("an unknown environment is refused by name", () => {
    expect(() => environmentSecrets(fixture(), "preprod")).toThrow(
      WorkerSecretsError
    )
    expect(() => environmentSecrets(fixture(), "preprod")).toThrow(
      UNKNOWN_ENVIRONMENT_RE
    )
  })

  test("each shipped environment carries its own domain secrets", () => {
    const config = readWranglerConfig(WEB_CONFIG)

    expect(environmentSecrets(config, "staging").required).toContain(
      "DATABASE_URL"
    )
    expect(environmentSecrets(config, "production").required).toContain(
      "R2_BUCKET_NAME"
    )
  })
})

describe("the bound secrets are read from wrangler or from a list", () => {
  test("the JSON of `wrangler secret list` is understood", () => {
    const payload = JSON.stringify([
      { name: "DATABASE_URL", type: "secret_text" },
      { name: "BETTER_AUTH_SECRET", type: "secret_text" },
    ])

    expect(parseBoundNames(payload)).toEqual([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ])
  })

  test("a plain list is understood", () => {
    expect(
      parseBoundNames("DATABASE_URL, BETTER_AUTH_SECRET\nR2_BUCKET_NAME")
    ).toEqual(["DATABASE_URL", "BETTER_AUTH_SECRET", "R2_BUCKET_NAME"])
  })

  test("nothing bound is an empty list", () => {
    expect(parseBoundNames("  ")).toEqual([])
  })
})

describe("the report names what is wrong", () => {
  test("a secret that is bound nowhere is missing", () => {
    const report = reportSecrets(environmentSecrets(fixture(), "staging"), [
      "DATABASE_URL",
    ])

    expect(report.missing).toEqual(["STRIPE_SECRET_KEY"])
    expect(report.inPlainVars).toEqual([])
  })

  test("a required secret declared in vars is reported as clear text", () => {
    const config = fixture()
    const staging = config.env?.staging ?? {}
    staging.vars = { STRIPE_SECRET_KEY: "left in the open" }

    const report = reportSecrets(environmentSecrets(config, "staging"), [
      "DATABASE_URL",
    ])

    expect(report.missing).toEqual([])
    expect(report.inPlainVars).toEqual(["STRIPE_SECRET_KEY"])
  })
})

describe("command line", () => {
  test("a missing secret refuses the deployment and names it", () => {
    const config = readWranglerConfig(WEB_CONFIG)
    const required = environmentSecrets(config, "staging").required
    const withoutOne = required.filter((name) => name !== "R2_BUCKET_NAME")

    const result = run(["staging"], withoutOne.join(","))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Deployment refused")
    expect(result.stderr).toContain("R2_BUCKET_NAME")
    expect(result.stderr).toContain("ppt-web-staging")
  })

  test("every missing secret is named", () => {
    const result = run(["production"], "DATABASE_URL")

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("R2_ACCOUNT_ID")
    expect(result.stderr).toContain("STRIPE_WEBHOOK_SECRET")
    expect(result.stderr).not.toContain("- DATABASE_URL")
  })

  test("a complete environment passes", () => {
    const required = environmentSecrets(
      readWranglerConfig(WEB_CONFIG),
      "production"
    ).required

    const result = run(["production"], required.join(","))

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("ppt-web-production")
  })

  test("an unknown environment is refused before any deployment", () => {
    const result = run(["preprod"], "DATABASE_URL")

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("preprod")
  })

  test("without an environment the usage is printed", () => {
    const result = run([], "DATABASE_URL")

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Usage")
  })

  test("a list of bound secrets can be read from a file", () => {
    const result = spawnSync("bun", [SCRIPT, "staging", "--bound-from", "-"], {
      encoding: "utf8",
      input: "DATABASE_URL",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("BETTER_AUTH_SECRET")
  })
})
