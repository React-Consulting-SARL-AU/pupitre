import { describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { signedAppMessage } from "../../apps/desktop/scripts/release-artefacts"
import { compatibility } from "../../packages/shared/src/compat"
import { helloFrom } from "../release/agent"
import { releaseKey, signArtefact } from "../release/app"
import { appVersion } from "../release/check"
import { argumentOf, hasFlag, required, variable } from "../release/cli"
import {
  enforcedSigning,
  macSigning,
  publishable,
  signingRequired,
  systemOfHost,
  windowsSigning,
  windowsSigningRequired,
} from "../release/desktop"
import { githubReleaseNotes } from "../release/github-release"
import { ciVerdict, pullRequestTitle } from "../release/merge"
import { nextVersion, partOf, writeAppVersion } from "../release/next"
import { keys } from "../release/r2"
import {
  bump,
  formatRelease,
  lastVersion,
  onReleaseBranch,
  originTags,
  pendingVersion,
  versionOfTag,
} from "../release/resolve"
import { parseTemplate } from "../release/secrets"
import { tagPlan } from "../release/ship"
import { feedNamesVersion, feedUrls, verdictOf } from "../release/verify"

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

  it("writes the resolution as the lines a runner appends to its environment", () => {
    const release = { channel: "stable", version: "0.1.0" }

    expect(formatRelease(release, "env").split("\n")).toEqual([
      "PUPITRE_RELEASE_VERSION=0.1.0",
      "PUPITRE_RELEASE_CHANNEL=stable",
    ])
    expect(JSON.parse(formatRelease(release, "json"))).toEqual(release)
  })

  it("names the pull request after the tag", () => {
    expect(pullRequestTitle("0.2.0")).toBe("release: v0.2.0")
  })
})

describe("the checks a release merge waits for", () => {
  const run = (
    id: number,
    name: string,
    status: string,
    conclusion: string | null = null
  ) => ({ conclusion, id, name, status })

  it("passes once the CI job called by the release succeeded", () => {
    expect(ciVerdict([run(1, "CI / Quality", "completed", "success")])).toEqual(
      { state: "passed" }
    )
  })

  it("counts the CI job of a pull request run as well", () => {
    expect(ciVerdict([run(1, "Quality", "completed", "success")])).toEqual({
      state: "passed",
    })
  })

  it("reports no check when the CI job never ran on the commit", () => {
    expect(ciVerdict([])).toEqual({ state: "missing" })
    expect(
      ciVerdict([
        run(1, "Agent", "completed", "success"),
        run(2, "Merge into main", "in_progress"),
      ])
    ).toEqual({ state: "missing" })
  })

  it("waits while the CI job is queued or running", () => {
    expect(ciVerdict([run(1, "CI / Quality", "in_progress")])).toEqual({
      state: "pending",
    })
  })

  it("fails on any conclusion other than success", () => {
    for (const conclusion of [
      "failure",
      "cancelled",
      "timed_out",
      "action_required",
      "skipped",
      "neutral",
    ]) {
      expect(
        ciVerdict([run(1, "CI / Quality", "completed", conclusion)])
      ).toEqual({
        reason: `CI / Quality: ${conclusion}`,
        state: "failed",
      })
    }
  })

  it("judges each CI job by its latest attempt", () => {
    expect(
      ciVerdict([
        run(1, "CI / Quality", "completed", "failure"),
        run(2, "CI / Quality", "completed", "success"),
      ])
    ).toEqual({ state: "passed" })
    expect(
      ciVerdict([
        run(2, "CI / Quality", "completed", "failure"),
        run(1, "CI / Quality", "completed", "success"),
      ])
    ).toEqual({ reason: "CI / Quality: failure", state: "failed" })
  })

  it("fails when one CI job failed even if another passed", () => {
    expect(
      ciVerdict([
        run(1, "CI / Quality", "completed", "success"),
        run(2, "Quality", "completed", "failure"),
      ])
    ).toEqual({ reason: "Quality: failure", state: "failed" })
  })
})

describe("the branch a release leaves from", () => {
  it("is staging, named by HEAD or holding the commit a runner checked out", () => {
    expect(onReleaseBranch("staging", () => false)).toBe(true)
    expect(onReleaseBranch("HEAD", () => true)).toBe(true)
    expect(onReleaseBranch("HEAD", () => false)).toBe(false)
    expect(onReleaseBranch("main", () => true)).toBe(false)
    expect(onReleaseBranch("feature", () => true)).toBe(false)
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

  it("lists every file a feed sends the updater to", () => {
    const feed = [
      "version: 0.1.0",
      "files:",
      "  - url: https://dl.example/app/0.1.0/Pupitre-0.1.0-x86_64.AppImage",
      "    sha512: abc",
      "  - url: https://dl.example/app/0.1.0/pupitre_0.1.0_amd64.deb",
      "path: https://dl.example/app/0.1.0/Pupitre-0.1.0-x86_64.AppImage",
    ].join("\n")

    expect(feedUrls(feed)).toEqual([
      "https://dl.example/app/0.1.0/Pupitre-0.1.0-x86_64.AppImage",
      "https://dl.example/app/0.1.0/pupitre_0.1.0_amd64.deb",
    ])
  })

  it("accepts a file the bucket serves whole, and names what is missing or short", () => {
    expect(verdictOf(200, "1234", 1234)).toBeNull()
    expect(verdictOf(404, null, 1234)).toBe("answers 404")
    expect(verdictOf(200, "12", 1234)).toBe("is 12 bytes, not 1234")
  })
})

describe("the GitHub release of a version", () => {
  const builds = [
    {
      os: "linux",
      arch: "x64",
      format: "deb",
      url: "https://dl.example/app/2.0.0/pupitre_2.0.0_amd64.deb",
      bytes: 102_036_640,
    },
    {
      os: "macos",
      arch: "arm64",
      format: "dmg",
      url: "https://dl.example/app/2.0.0/Pupitre-2.0.0-arm64.dmg",
      bytes: 131_803_555,
    },
    {
      os: "windows",
      arch: "x64",
      format: "exe",
      url: "https://dl.example/app/2.0.0/Pupitre-Setup-2.0.0-x64.exe",
      bytes: 119_199_700,
    },
  ]

  it("opens on the release notes, then links every download from the bucket, macOS first", () => {
    const notes = githubReleaseNotes("## The app\n\n- A change.\n", builds)
    const rows = notes
      .split("\n")
      .filter((line) => line.startsWith("| ") && line.includes("]("))

    expect(notes.startsWith("## The app\n\n- A change.\n\n## Downloads")).toBe(
      true
    )
    expect(rows).toEqual([
      "| macOS | arm64 | [Pupitre-2.0.0-arm64.dmg](https://dl.example/app/2.0.0/Pupitre-2.0.0-arm64.dmg) | 125.7 MB |",
      "| Windows | x64 | [Pupitre-Setup-2.0.0-x64.exe](https://dl.example/app/2.0.0/Pupitre-Setup-2.0.0-x64.exe) | 113.7 MB |",
      "| Linux | x64 | [pupitre_2.0.0_amd64.deb](https://dl.example/app/2.0.0/pupitre_2.0.0_amd64.deb) | 97.3 MB |",
    ])
  })

  it("says why the agent is not attached and where every version lives", () => {
    const notes = githubReleaseNotes("Notes", builds)

    expect(notes).toContain("The agent is not attached")
    expect(notes).toContain("https://pupitre.studio/download/")
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

  it("keeps the version the first pass wrote when the second pass names no part", () => {
    expect(nextVersion([], "0.9.1", "1.0.0")).toBe("1.0.0")
    expect(nextVersion(["--major"], "0.9.1", "1.0.0")).toBe("1.0.0")
    expect(nextVersion([], "0.9.1", "0.10.0")).toBe("0.10.0")
    expect(nextVersion(["--minor"], "0.9.1", "0.9.2")).toBe("0.10.0")
    expect(nextVersion([], "0.9.1", "0.9.1")).toBe("0.9.2")
    expect(nextVersion(["--major"], "0.9.1", "0.9.1")).toBe("1.0.0")
  })

  it("refuses a named version that is no version, or not above the last tag", () => {
    expect(() => nextVersion(["--version=v1.0.0"], "0.9.1", "0.9.1")).toThrow(
      "not a version"
    )
    expect(() => nextVersion(["--version=01.0.0"], "0.9.1", "0.9.1")).toThrow(
      "not a version"
    )
    expect(() => nextVersion(["--version=0.9.1"], "0.9.1", "0.9.1")).toThrow(
      "above 0.9.1"
    )
    expect(() => nextVersion(["--version=0.10.0"], "1.0.0", "1.0.0")).toThrow(
      "above 1.0.0"
    )
    expect(nextVersion(["--version=0.10.0"], "0.9.1", "0.9.1")).toBe("0.10.0")
  })

  it("keeps a version tagged here and not on origin, unless one is named", () => {
    expect(nextVersion([], "0.1.0", "0.1.1", "0.1.1")).toBe("0.1.1")
    expect(nextVersion(["--minor"], "0.1.0", "0.1.1", "0.1.1")).toBe("0.1.1")
    expect(nextVersion(["--version=3.0.0"], "0.1.0", "0.1.1", "0.1.1")).toBe(
      "3.0.0"
    )
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

describe("the tags a release counts", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pupitre-tags-"))
  const origin = path.join(dir, "origin.git")
  const work = path.join(dir, "work")
  const git = (...argv: string[]): string =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...argv],
      { cwd: work, encoding: "utf8" }
    ).trim()
  const commit = (message: string): void => {
    writeFileSync(path.join(work, message), message)
    git("add", ".")
    git("commit", "-q", "-m", message)
  }

  execFileSync("git", ["init", "-q", "--bare", origin])
  execFileSync("git", ["init", "-q", "-b", "staging", work])
  git("remote", "add", "origin", origin)
  commit("one")

  it("counts no tag before the first release", () => {
    expect(originTags(work)).toEqual(new Set())
    expect(lastVersion(originTags(work), work)).toBeNull()
    expect(pendingVersion(originTags(work), work)).toBeNull()
  })

  it("counts a tag once origin holds it", () => {
    git("tag", "-a", "v0.1.0", "-m", "Pupitre 0.1.0")
    git("push", "-q", "origin", "staging", "v0.1.0")
    commit("two")

    expect(originTags(work)).toEqual(new Set(["v0.1.0"]))
    expect(lastVersion(originTags(work), work)).toBe("0.1.0")
    expect(pendingVersion(originTags(work), work)).toBeNull()
  })

  it("reads a tag on HEAD that origin lacks as a release to resume, not as one out", () => {
    git("tag", "-a", "v0.1.1", "-m", "Pupitre 0.1.1")

    expect(lastVersion(originTags(work), work)).toBe("0.1.0")
    expect(pendingVersion(originTags(work), work)).toBe("0.1.1")
    expect(nextVersion([], "0.1.0", "0.1.1", "0.1.1")).toBe("0.1.1")

    git("push", "-q", "origin", "staging", "v0.1.1")

    expect(lastVersion(originTags(work), work)).toBe("0.1.1")
    expect(pendingVersion(originTags(work), work)).toBeNull()
  })

  it("stops when origin cannot be asked", () => {
    git("remote", "set-url", "origin", path.join(dir, "nowhere.git"))

    expect(() => originTags(work)).toThrow("origin is out of reach")
  })
})

describe("what ship does with a tag", () => {
  it("cuts it, or only pushes one already on HEAD, and refuses one elsewhere", () => {
    expect(tagPlan("v0.1.1", null, "abc")).toBe("tag")
    expect(tagPlan("v0.1.1", "abc", "abc")).toBe("push")
    expect(() => tagPlan("v0.1.1", "def", "abc")).toThrow("another commit")
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
  it("greets the agent as the app of the same release, which its floor accepts", () => {
    for (const version of ["1.0.0", "1.4.2", "2.0.0"]) {
      const hello = JSON.parse(helloFrom(version))

      expect(hello.params.app_version).toBe(version)
      expect(compatibility(version, version)).toBe("ok")
    }
  })
})

describe("the app on a system", () => {
  it("names the system it runs on, and refuses one the app does not ship on", () => {
    expect(systemOfHost("darwin")).toBe("macos")
    expect(systemOfHost("win32")).toBe("windows")
    expect(systemOfHost("linux")).toBe("linux")
    expect(() => systemOfHost("freebsd")).toThrow("freebsd")
  })

  it("stages one system's installers, what the updater fetches beside them and its feed, nothing else", () => {
    const files = [
      "builder-debug.yml",
      "Pupitre-0.1.0-arm64.dmg",
      "Pupitre-0.1.0-arm64.dmg.blockmap",
      "Pupitre-0.1.0-arm64.zip",
      "Pupitre-0.1.0-arm64.zip.blockmap",
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
      "Pupitre-0.1.0-arm64.zip",
      "Pupitre-0.1.0-arm64.zip.blockmap",
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

    expect(macSigning(notarizing, keyFile, false)).toEqual(notarized)
    expect(written).toEqual(["cGVt"])

    expect(
      macSigning(
        {
          ...notarizing,
          APPLE_CERTIFICATE: "cDEy",
          APPLE_CERTIFICATE_PASSWORD: "secret",
        },
        keyFile,
        false
      )
    ).toEqual({ ...notarized, CSC_KEY_PASSWORD: "secret", CSC_LINK: "cDEy" })

    expect(
      macSigning({ ...notarizing, APPLE_API_ISSUER: "" }, keyFile, false)
    ).toEqual({ CSC_IDENTITY_AUTO_DISCOVERY: "false" })
    expect(written).toHaveLength(2)
  })

  it("refuses to build a stable macOS app without the certificate and the notarization key", () => {
    const keyFile = () => "/tmp/key.p8"
    const complete = {
      APPLE_API_ISSUER: "issuer",
      APPLE_API_KEY_CONTENT: "cGVt",
      APPLE_API_KEY_ID: "KEYID12345",
      APPLE_CERTIFICATE: "cDEy",
      APPLE_CERTIFICATE_PASSWORD: "secret",
    }

    expect(macSigning(complete, keyFile, true)).toMatchObject({
      APPLE_API_KEY: "/tmp/key.p8",
      CSC_LINK: "cDEy",
    })
    expect(() =>
      macSigning({ ...complete, APPLE_CERTIFICATE: "" }, keyFile, true)
    ).toThrow("APPLE_CERTIFICATE")
    expect(() => macSigning({}, keyFile, true)).toThrow("APPLE_API_KEY_CONTENT")
  })

  it("passes the Azure names and the publisher to electron-builder, or none", () => {
    const names = {
      AZURE_SIGNING_ACCOUNT: "acct",
      AZURE_SIGNING_ENDPOINT: "https://weu.codesigning.azure.net",
      AZURE_SIGNING_PROFILE: "profile",
    }

    expect(windowsSigning(names, false)).toEqual([
      "-c.win.azureSignOptions.endpoint=https://weu.codesigning.azure.net",
      "-c.win.azureSignOptions.codeSigningAccountName=acct",
      "-c.win.azureSignOptions.certificateProfileName=profile",
    ])
    expect(
      windowsSigning(
        { ...names, AZURE_SIGNING_PUBLISHER: "Jordan Monier" },
        false
      )
    ).toContain("-c.win.azureSignOptions.publisherName=Jordan Monier")
    expect(windowsSigning({ AZURE_SIGNING_ACCOUNT: "acct" }, false)).toEqual([])
  })

  it("refuses to build a stable Windows app that electron-updater could not check", () => {
    const complete = {
      AZURE_CLIENT_ID: "client",
      AZURE_CLIENT_SECRET: "secret",
      AZURE_SIGNING_ACCOUNT: "acct",
      AZURE_SIGNING_ENDPOINT: "https://weu.codesigning.azure.net",
      AZURE_SIGNING_PROFILE: "profile",
      AZURE_SIGNING_PUBLISHER: "Jordan Monier",
      AZURE_TENANT_ID: "tenant",
    }

    expect(windowsSigning(complete, true)).toContain(
      "-c.win.azureSignOptions.publisherName=Jordan Monier"
    )
    expect(() =>
      windowsSigning({ ...complete, AZURE_SIGNING_PUBLISHER: "" }, true)
    ).toThrow("AZURE_SIGNING_PUBLISHER")
    expect(() => windowsSigning({}, true)).toThrow("AZURE_SIGNING_ENDPOINT")
  })

  it("holds the stable channel alone to a signed build, which electron-builder must not skip", () => {
    expect(signingRequired("stable")).toBe(true)
    expect(signingRequired("beta")).toBe(false)
    expect(enforcedSigning("macos", true)).toEqual([
      "-c.mac.forceCodeSigning=true",
    ])
    expect(enforcedSigning("windows", true)).toEqual([
      "-c.win.forceCodeSigning=true",
    ])
    expect(enforcedSigning("linux", true)).toEqual([])
    expect(enforcedSigning("macos", false)).toEqual([])
  })

  it("lets a stable Windows build go out unsigned only when the release says so", () => {
    expect(windowsSigningRequired("stable", {})).toBe(true)
    expect(
      windowsSigningRequired("stable", { PUPITRE_ALLOW_UNSIGNED_WINDOWS: "1" })
    ).toBe(false)
    expect(
      windowsSigningRequired("stable", {
        PUPITRE_ALLOW_UNSIGNED_WINDOWS: "true",
      })
    ).toBe(true)
    expect(windowsSigningRequired("beta", {})).toBe(false)
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
