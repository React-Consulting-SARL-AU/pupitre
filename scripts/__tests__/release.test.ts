import { describe, expect, it } from "bun:test"
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { signedAppMessage } from "../../apps/desktop/scripts/release-artefacts"
import { readableOccurrences } from "../release/agent"
import { releaseKey, signArtefact } from "../release/app"
import { appVersion } from "../release/check"
import { argumentOf, hasFlag, required, variable } from "../release/cli"
import {
  macSigning,
  publishable,
  systemOfHost,
  systemsToBuild,
  windowsSigning,
} from "../release/desktop"
import { nextVersion, partOf, writeAppVersion } from "../release/next"
import { keys } from "../release/r2"
import {
  bump,
  formatRelease,
  platformFor,
  versionOfTag,
} from "../release/resolve"

describe("the command line of a step", () => {
  it("reads a flag's value, a bare flag, and refuses an empty variable", () => {
    const argv = ["build", "--version=1.2.3", "--dry-run"]

    expect(argumentOf(argv, "version")).toBe("1.2.3")
    expect(argumentOf(argv, "channel")).toBeUndefined()
    expect(hasFlag(argv, "dry-run")).toBe(true)
    expect(() => required("X", "")).toThrow("X is not set")
    expect(variable({ PUPITRE_RELEASE_VERSION: "1.2.3" }, "version")).toBe(
      "1.2.3"
    )
    expect(() => variable({}, "version")).toThrow("PUPITRE_RELEASE_VERSION")
  })
})

describe("what a tag and a branch say", () => {
  it("reads a version out of a v tag and nothing else", () => {
    expect(versionOfTag("v0.1.0")).toBe("0.1.0")
    expect(versionOfTag("v10.2.33")).toBe("10.2.33")
    expect(versionOfTag("0.1.0")).toBeNull()
    expect(versionOfTag("v0.1")).toBeNull()
    expect(versionOfTag("v0.1.0-rc1")).toBeNull()
  })

  it("sends main to production and staging to staging", () => {
    const env = {
      PUPITRE_PRODUCTION_PLATFORM_URL: "https://app.example",
      PUPITRE_STAGING_PLATFORM_URL: "https://staging.example",
    }

    expect(platformFor("main", env)).toBe("https://app.example")
    expect(platformFor("staging", env)).toBe("https://staging.example")
    expect(
      platformFor("staging", { PUPITRE_PRODUCTION_PLATFORM_URL: "x" })
    ).toBeNull()
  })

  it("writes the resolution as the lines a runner appends to its environment", () => {
    const release = {
      branch: "staging" as const,
      channel: "beta",
      platform: "https://staging.example",
      version: "0.1.0",
    }

    expect(formatRelease(release, "env").split("\n")).toEqual([
      "PUPITRE_RELEASE_VERSION=0.1.0",
      "PUPITRE_RELEASE_CHANNEL=beta",
      "PUPITRE_PLATFORM_URL=https://staging.example",
      "PUPITRE_RELEASE_BRANCH=staging",
    ])
    expect(JSON.parse(formatRelease(release, "json"))).toEqual(release)
  })
})

describe("the next version", () => {
  it("follows the last tag by the part asked, or takes the version given", () => {
    expect(bump("0.1.0", "patch")).toBe("0.1.1")
    expect(bump("0.1.9", "minor")).toBe("0.2.0")
    expect(bump("1.4.2", "major")).toBe("2.0.0")
    expect(() => bump("v1", "patch")).toThrow("semver")
    expect(partOf(["--minor"])).toBe("minor")
    expect(partOf([])).toBe("patch")
    expect(nextVersion(["--minor"], "0.1.0", "0.0.0")).toBe("0.2.0")
    expect(nextVersion([], null, "0.1.0")).toBe("0.1.0")
    expect(nextVersion(["--version=3.0.0"], "0.1.0", "0.0.0")).toBe("3.0.0")
  })

  it("rewrites the version line of the manifest and nothing else", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pupitre-next-"))
    const manifest = path.join(dir, "package.json")

    writeFileSync(
      manifest,
      '{\n  "name": "@pupitre/desktop",\n  "version": "0.1.0",\n  "private": true\n}\n'
    )
    writeAppVersion("0.2.0", manifest)

    expect(readFileSync(manifest, "utf8")).toBe(
      '{\n  "name": "@pupitre/desktop",\n  "version": "0.2.0",\n  "private": true\n}\n'
    )
  })
})

describe("what must be true before a build", () => {
  it("reads the version the app declares", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pupitre-release-"))

    mkdirSync(path.join(root, "apps/desktop"), { recursive: true })
    writeFileSync(
      path.join(root, "apps/desktop/package.json"),
      JSON.stringify({ version: "0.1.0" })
    )

    expect(appVersion(root)).toBe("0.1.0")
  })
})

describe("the agent's checks", () => {
  it("counts what garble left readable", () => {
    expect(readableOccurrences(Buffer.from("nothing here"))).toBe(0)
    expect(readableOccurrences(Buffer.from("pupitre\0\0pupitre"))).toBe(2)
  })
})

describe("the app on a system", () => {
  it("names the system it runs on, and refuses one the app does not ship on", () => {
    expect(systemOfHost("darwin")).toBe("macos")
    expect(systemOfHost("win32")).toBe("windows")
    expect(systemOfHost("linux")).toBe("linux")
    expect(() => systemOfHost("freebsd")).toThrow("freebsd")
  })

  it("stages one system's installers, their blockmaps and its feed, nothing else", () => {
    const files = [
      "builder-debug.yml",
      "Pupitre-0.1.0-arm64.dmg",
      "Pupitre-0.1.0-arm64.dmg.blockmap",
      "latest-mac.yml",
      "latest.yml",
      "mac-arm64",
      "Pupitre-0.1.0-x64.exe",
      "Pupitre-0.1.0-x64.AppImage",
      "latest-linux.yml",
    ]

    expect(publishable("macos", files)).toEqual([
      "Pupitre-0.1.0-arm64.dmg",
      "Pupitre-0.1.0-arm64.dmg.blockmap",
      "latest-mac.yml",
    ])
    expect(publishable("windows", files)).toEqual([
      "Pupitre-0.1.0-x64.exe",
      "latest.yml",
    ])
    expect(publishable("linux", files)).toEqual([
      "Pupitre-0.1.0-x64.AppImage",
      "latest-linux.yml",
    ])
  })

  it("builds the three systems from macOS, one elsewhere, or the one asked", () => {
    expect(systemsToBuild([], "darwin")).toEqual(["macos", "linux", "windows"])
    expect(systemsToBuild([], "linux")).toEqual(["linux"])
    expect(systemsToBuild(["--system=windows"], "darwin")).toEqual(["windows"])
    expect(() => systemsToBuild(["--system=freebsd"], "darwin")).toThrow(
      "freebsd"
    )
  })

  it("notarizes on macOS with the three App Store Connect values, and says so otherwise", () => {
    const written: string[] = []
    const keyFile = (content: string) => {
      written.push(content)

      return "/tmp/key.p8"
    }
    const full = {
      APPLE_API_ISSUER: "issuer",
      APPLE_API_KEY_CONTENT: "cGVt",
      APPLE_API_KEY_ID: "KEYID12345",
    }

    expect(macSigning(full, keyFile)).toEqual({
      APPLE_API_ISSUER: "issuer",
      APPLE_API_KEY: "/tmp/key.p8",
      APPLE_API_KEY_ID: "KEYID12345",
    })
    expect(written).toEqual(["cGVt"])

    expect(macSigning({ ...full, APPLE_API_ISSUER: "" }, keyFile)).toEqual({
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
    })
    expect(written).toHaveLength(1)
  })

  it("passes the three Azure names to electron-builder, or none", () => {
    expect(
      windowsSigning({
        AZURE_SIGNING_ACCOUNT: "acct",
        AZURE_SIGNING_ENDPOINT: "https://weu.codesigning.azure.net",
        AZURE_SIGNING_PROFILE: "profile",
      })
    ).toEqual([
      "-c.win.azureSignOptions.endpoint=https://weu.codesigning.azure.net",
      "-c.win.azureSignOptions.codeSigningAccountName=acct",
      "-c.win.azureSignOptions.certificateProfileName=profile",
    ])
    expect(windowsSigning({ AZURE_SIGNING_ACCOUNT: "acct" })).toEqual([])
  })
})

describe("the release key over an installer", () => {
  it("signs what the app verifies, with the raw Ed25519 key the chain holds", () => {
    const pair = generateKeyPairSync("ed25519")
    const seed = pair.privateKey
      .export({ format: "der", type: "pkcs8" })
      .subarray(-32)
    const publicRaw = pair.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
    const raw = Buffer.concat([seed, publicRaw]).toString("base64")
    const key = releaseKey(raw)
    const signature = signArtefact(
      key,
      "0.1.0",
      "macos",
      "arm64",
      "ab".repeat(32)
    )
    const message = signedAppMessage("0.1.0", "macos", "arm64", "ab".repeat(32))

    expect(
      verify(
        null,
        message,
        createPublicKey(key),
        Buffer.from(signature, "base64")
      )
    ).toBe(true)
    expect(() => releaseKey("c2hvcnQ=")).toThrow("Ed25519")
  })
})

describe("where a version lives in the buckets", () => {
  it("keeps the agent, the app's declarations and each system's work under the version", () => {
    expect(keys.agent("0.1.0", "release.json")).toBe("agent/0.1.0/release.json")
    expect(keys.appDeclarations("0.1.0")).toBe("app/0.1.0/publications.json")
    expect(keys.work("0.1.0", "macos", "index.json")).toBe(
      "work/0.1.0/macos/index.json"
    )
  })
})
