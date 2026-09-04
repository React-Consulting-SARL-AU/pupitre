import { describe, expect, it } from "bun:test"
import {
  CatalogResultSchema,
  HardenParamsSchema,
  HardenResultSchema,
  InstallParamsSchema,
  InstallReportSchema,
  InstallResultSchema,
  InstallSecretsSchema,
  ProbeResultSchema,
  ProbeVerdictSchema,
  UninstallParamsSchema,
  UpgradeParamsSchema,
} from "./install"

const probe = {
  os: "ubuntu",
  version: "24.04",
  arch: "amd64",
  ram_mb: 7936,
  disk_free_gb: 61.4,
  sudo: true,
  ports: [{ port: 22, process: "sshd" }],
  docker: false,
  panel: null,
  agent_version: null,
  installed_modules: [],
  verdict: { level: "ready", kind: "bare", reasons: [], fixes: [] },
}

describe("ProbeResultSchema", () => {
  it("accepts a probe report", () => {
    expect(ProbeResultSchema.safeParse(probe).success).toBe(true)
  })

  it("describes a machine an amd64/arm64 build cannot run on", () => {
    expect(
      ProbeResultSchema.safeParse({
        ...probe,
        arch: "i686",
        verdict: {
          level: "blocked",
          kind: "incompatible",
          reasons: ["Architecture non prise en charge : i686."],
          fixes: ["Choisis un serveur amd64 (x86_64) ou arm64 (aarch64)."],
        },
      }).success
    ).toBe(true)
  })

  it("accepts an unreadable architecture and rejects a missing verdict", () => {
    expect(ProbeResultSchema.safeParse({ ...probe, arch: "" }).success).toBe(
      true
    )
    const { verdict: _verdict, ...withoutVerdict } = probe
    expect(ProbeResultSchema.safeParse(withoutVerdict).success).toBe(false)
  })
})

describe("ProbeVerdictSchema", () => {
  it("accepts a managed machine carrying whether it is up to date", () => {
    expect(
      ProbeVerdictSchema.safeParse({
        level: "warning",
        kind: "managed",
        up_to_date: false,
        reasons: ["Pupitre est déjà installé : agent 0.1.0."],
        fixes: ["Mets l'agent à jour depuis l'app."],
      }).success
    ).toBe(true)
  })

  it("accepts a non-managed kind without up_to_date", () => {
    expect(
      ProbeVerdictSchema.safeParse({
        level: "warning",
        kind: "occupied",
        reasons: ["Docker est installé."],
        fixes: ["Installe quand même."],
      }).success
    ).toBe(true)
  })

  it("rejects a verdict without kind or fixes", () => {
    expect(
      ProbeVerdictSchema.safeParse({ level: "ready", reasons: [], fixes: [] })
        .success
    ).toBe(false)
    expect(
      ProbeVerdictSchema.safeParse({
        level: "ready",
        kind: "bare",
        reasons: [],
      }).success
    ).toBe(false)
  })
})

describe("CatalogResultSchema", () => {
  it("accepts modules and presets, rejects a bare list", () => {
    expect(
      CatalogResultSchema.safeParse({ modules: [], presets: [] }).success
    ).toBe(true)
    expect(CatalogResultSchema.safeParse([]).success).toBe(false)
  })
})

describe("InstallParamsSchema", () => {
  it("accepts modules with their configuration", () => {
    expect(
      InstallParamsSchema.safeParse({
        modules: ["core.system", "db.postgres"],
        config: {
          "core.system": { timezone: "Europe/Paris" },
          "db.postgres": {},
        },
        secrets_stdin: true,
      }).success
    ).toBe(true)
  })

  it("rejects a secret value carried in params", () => {
    expect(
      InstallParamsSchema.safeParse({
        modules: ["db.postgres"],
        config: {},
        secrets_stdin: true,
        secrets: { app_password: "hunter2" },
      }).success
    ).toBe(false)
    expect(
      InstallParamsSchema.safeParse({ modules: "db.postgres", config: {} })
        .success
    ).toBe(false)
  })
})

describe("InstallSecretsSchema", () => {
  it("mirrors config: values grouped by module id", () => {
    expect(
      InstallSecretsSchema.safeParse({
        "db.postgres": { app_password: "hunter2", remote_password: "s3cret" },
        "tool.github": {},
      }).success
    ).toBe(true)
    expect(InstallSecretsSchema.safeParse({}).success).toBe(true)
  })

  it("carries a list of secrets under indexed keys", () => {
    expect(
      InstallSecretsSchema.safeParse({
        "ai.hermes": { "providers.0": "sk-one", "providers.1": "sk-two" },
      }).success
    ).toBe(true)
  })

  it("rejects a flat line, a non-string value and a non-object", () => {
    expect(
      InstallSecretsSchema.safeParse({ app_password: "hunter2" }).success
    ).toBe(false)
    expect(
      InstallSecretsSchema.safeParse({ "db.postgres": { port: 5432 } }).success
    ).toBe(false)
    expect(InstallSecretsSchema.safeParse(["hunter2"]).success).toBe(false)
  })
})

describe("InstallResultSchema", () => {
  it("accepts failed and warned lists with the report path", () => {
    expect(
      InstallResultSchema.safeParse({
        failed: ["editor.jetbrains"],
        warned: [],
        report_path: "/etc/pupitre/reports/2026-09-04.json",
      }).success
    ).toBe(true)
    expect(InstallResultSchema.safeParse({ failed: [] }).success).toBe(false)
  })
})

describe("UninstallParamsSchema and UpgradeParamsSchema", () => {
  it("require modules for uninstall and make them optional for upgrade", () => {
    expect(
      UninstallParamsSchema.safeParse({ modules: ["db.redis"] }).success
    ).toBe(true)
    expect(UninstallParamsSchema.safeParse({}).success).toBe(false)
    expect(UpgradeParamsSchema.safeParse({}).success).toBe(true)
    expect(
      UpgradeParamsSchema.safeParse({ modules: ["runtime.node"] }).success
    ).toBe(true)
    expect(UpgradeParamsSchema.safeParse({ modules: "all" }).success).toBe(
      false
    )
  })
})

describe("HardenParamsSchema and HardenResultSchema", () => {
  it("only harden towards dev", () => {
    expect(HardenParamsSchema.safeParse({ user: "dev" }).success).toBe(true)
    expect(HardenParamsSchema.safeParse({ user: "root" }).success).toBe(false)
  })

  it("report whether root was closed and why not", () => {
    expect(
      HardenResultSchema.safeParse({ root_closed: true, next_user: "dev" })
        .success
    ).toBe(true)
    expect(
      HardenResultSchema.safeParse({
        root_closed: false,
        next_user: "root",
        reason: "no key opens dev",
      }).success
    ).toBe(true)
    expect(HardenResultSchema.safeParse({ root_closed: "no" }).success).toBe(
      false
    )
  })
})

describe("InstallReportSchema", () => {
  it("accepts a report and rejects one without modules", () => {
    expect(
      InstallReportSchema.safeParse({
        started_at: "2026-09-04T10:00:00Z",
        finished_at: "2026-09-04T10:04:12Z",
        agent_version: "0.3.1",
        modules: [
          {
            id: "core.system",
            status: "ok",
            steps: [{ step: "packages", status: "ok", ms: 4210 }],
          },
          {
            id: "editor.jetbrains",
            status: "fail",
            steps: [
              {
                step: "download",
                status: "fail",
                ms: 30_000,
                replay: "pupitred install editor.jetbrains",
              },
            ],
          },
        ],
        failed: ["editor.jetbrains"],
        warned: [],
        report_path: "/etc/pupitre/reports/2026-09-04.json",
      }).success
    ).toBe(true)
    expect(
      InstallReportSchema.safeParse({ failed: [], warned: [] }).success
    ).toBe(false)
  })
})
