import { describe, expect, it } from "bun:test"
import {
  CatalogResultSchema,
  HardenParamsSchema,
  HardenResultSchema,
  InstallParamsSchema,
  InstallReportSchema,
  InstallResultSchema,
  ProbeResultSchema,
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
  verdict: { level: "ready", reasons: [] },
}

describe("ProbeResultSchema", () => {
  it("accepts a probe report", () => {
    expect(ProbeResultSchema.safeParse(probe).success).toBe(true)
  })

  it("rejects an unsupported architecture and a missing verdict", () => {
    expect(
      ProbeResultSchema.safeParse({ ...probe, arch: "i386" }).success
    ).toBe(false)
    const { verdict: _verdict, ...withoutVerdict } = probe
    expect(ProbeResultSchema.safeParse(withoutVerdict).success).toBe(false)
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
