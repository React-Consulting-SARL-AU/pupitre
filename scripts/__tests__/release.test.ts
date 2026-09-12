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
  windowsSigning,
} from "../release/desktop"
import { nextVersion, partOf, writeAppVersion } from "../release/next"
import { keys } from "../release/r2"
import {
  branchHolding,
  bump,
  formatRelease,
  platformFor,
  versionOfTag,
} from "../release/resolve"
import { parseTemplate } from "../release/secrets"
import { feedNamesVersion, verdictOf } from "../release/verify"

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

describe("the branch a runner releases from", () => {
  it("is the one HEAD names, else staging when staging holds the commit, else main", () => {
    expect(branchHolding("staging", () => false)).toBe("staging")
    expect(branchHolding("main", () => true)).toBe("main")
    expect(branchHolding("HEAD", (branch) => branch === "staging")).toBe(
      "staging"
    )
    expect(branchHolding("HEAD", () => true)).toBe("staging")
    expect(branchHolding("HEAD", (branch) => branch === "main")).toBe("main")
    expect(branchHolding("HEAD", () => false)).toBeNull()
    expect(branchHolding("feature", () => false)).toBeNull()
  })
})

describe("the template of the release environment", () => {
  it("tells a 1Password reference from a plain value, and skips comments", () => {
    const source = [
      "# what a release needs",
      "",
      "PUPITRE_DOWNLOADS_URL=https://dl.example",
      'R2_SECRET_ACCESS_KEY="op://Vault/note/R2_SECRET_ACCESS_KEY"',
      "PUPITRE_PUBLISH_TOKEN=op://Vault/note/PUPITRE_PUBLISH_TOKEN",
    ].join("\n")

    expect(parseTemplate(source)).toEqual([
      {
        name: "PUPITRE_DOWNLOADS_URL",
        secret: false,
        value: "https://dl.example",
      },
      {
        name: "R2_SECRET_ACCESS_KEY",
        secret: true,
        value: "op://Vault/note/R2_SECRET_ACCESS_KEY",
      },
      {
        name: "PUPITRE_PUBLISH_TOKEN",
        secret: true,
        value: "op://Vault/note/PUPITRE_PUBLISH_TOKEN",
      },
    ])
  })
})

describe("what a customer can download once a version is published", () => {
  it("reads a version out of a feed and nothing near it", () => {
    expect(feedNamesVersion("version: 0.1.0\nfiles:\n", "0.1.0")).toBe(true)
    expect(feedNamesVersion("version: 0.1.10\n", "0.1.1")).toBe(false)
    expect(feedNamesVersion("", "0.1.0")).toBe(false)
  })

  it("accepts a file the bucket serves whole, and names what is missing or short", () => {
    expect(verdictOf(200, "1234", 1234)).toBeNull()
    expect(verdictOf(404, null, 1234)).toBe("answers 404")
    expect(verdictOf(200, "12", 1234)).toBe("is 12 bytes, not 1234")
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

  it("signs on macOS with the certificate given, or the keychain's, and notarizes with the App Store Connect key", () => {
    const written: string[] = []
    const keyFile = (content: string) => {
      written.push(content)

      return "/tmp/key.p8"
    }
    const notarizing = {
      APPLE_API_ISSUER: "issuer",
      APPLE_API_KEY_CONTENT: "cGVt",
      APPLE_API_KEY_ID: "KEYID12345",
    }
    const notarized = {
      APPLE_API_ISSUER: "issuer",
      APPLE_API_KEY: "/tmp/key.p8",
      APPLE_API_KEY_ID: "KEYID12345",
      DEBUG: "electron-notarize*",
    }

    expect(macSigning(notarizing, keyFile)).toEqual(notarized)
    expect(written).toEqual(["cGVt"])

    expect(
      macSigning(
        {
          ...notarizing,
          APPLE_CERTIFICATE: "cDEy",
          APPLE_CERTIFICATE_PASSWORD: "secret",
        },
        keyFile
      )
    ).toEqual({ ...notarized, CSC_KEY_PASSWORD: "secret", CSC_LINK: "cDEy" })

    expect(
      macSigning({ ...notarizing, APPLE_API_ISSUER: "" }, keyFile)
    ).toEqual({ CSC_IDENTITY_AUTO_DISCOVERY: "false" })
    expect(written).toHaveLength(2)
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
