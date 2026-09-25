import { describe, expect, test } from "bun:test"
import {
  BackupOpenError,
  deriveBackupIdentity,
  drawBackupSalt,
  normalizePassphrase,
  openBackup,
  sealBackup,
} from "./crypto"
import fixtures from "./fixtures.json"
import {
  BACKUP_DATABASE_ITEM_PATTERN,
  BACKUP_EXTRA_PATH_PATTERN,
  BackupDeclarationSchema,
  BackupIdSchema,
  BackupLocationSchema,
  BackupManifestSchema,
  BackupNameSchema,
} from "./index"

const fromBase64 = (value: string) => Buffer.from(value, "base64")

describe("the key derivation", () => {
  for (const vector of fixtures.kdf) {
    test(`derives the fixture for ${JSON.stringify(vector.normalized)}`, async () => {
      expect(normalizePassphrase(vector.passphrase)).toBe(vector.normalized)

      const identity = await deriveBackupIdentity(
        vector.passphrase,
        vector.salt
      )

      expect(identity.privateKey.toString("base64")).toBe(vector.private_key)
      expect(identity.recipient).toBe(vector.recipient)
    })
  }

  test("a salt is sixteen random bytes", () => {
    const salt = drawBackupSalt()

    expect(fromBase64(salt)).toHaveLength(16)
    expect(drawBackupSalt()).not.toBe(salt)
  })
})

describe("the container", () => {
  for (const vector of fixtures.containers) {
    test(`seals ${vector.name} to the fixture and opens it`, () => {
      const sealed = sealBackup(
        fromBase64(vector.plaintext),
        vector.recipient,
        {
          chunkBytes: vector.chunk_bytes,
          ephemeralPrivateKey: fromBase64(vector.ephemeral_private_key),
          noncePrefix: fromBase64(vector.nonce_prefix),
        }
      )

      expect(sealed.toString("base64")).toBe(vector.sealed)
      expect(
        openBackup(sealed, fromBase64(vector.private_key)).toString("base64")
      ).toBe(vector.plaintext)
    })
  }

  for (const vector of fixtures.refusals) {
    test(`refuses ${vector.name}`, () => {
      expect(() =>
        openBackup(fromBase64(vector.sealed), fromBase64(vector.private_key))
      ).toThrow(BackupOpenError)
    })
  }

  test("a megabyte and a half round-trips with the real chunk size", async () => {
    const { privateKey, recipient } = await deriveBackupIdentity(
      "round trip",
      drawBackupSalt(),
      1000
    )
    const plaintext = Buffer.alloc(1_572_864, 7)

    expect(openBackup(sealBackup(plaintext, recipient), privateKey)).toEqual(
      plaintext
    )
  })
})

const manifest = {
  format: 1,
  id: "20260919T031500Z-7f3a2c",
  created_at: "2026-09-19T03:15:00Z",
  trigger: "schedule",
  server: {
    id: "srv_1",
    hostname: "atelier",
    arch: "amd64",
    agent_version: "0.8.0",
    config_revision: 7,
  },
  recipient: fixtures.kdf[0]?.recipient,
  kdf: {
    alg: "pbkdf2-sha256",
    iterations: 600_000,
    salt: fixtures.kdf[0]?.salt,
  },
  modules: ["core.system", "db.postgres"],
  running: ["intranet"],
  parts: [
    {
      key: "setup.pupitre",
      kind: "setup",
      bytes: 3812,
      sha256: "a".repeat(64),
    },
    {
      key: "home.pupitre",
      kind: "home",
      paths: [".ssh", ".gitconfig", ".claude"],
      bytes: 90_112,
      sha256: "f".repeat(64),
      fingerprint: "0".repeat(64),
    },
    {
      key: "db-postgres-flyleaf.pupitre",
      kind: "database",
      engine: "postgres",
      name: "flyleaf",
      format: "pg_custom",
      bytes: 48_213_990,
      sha256: "b".repeat(64),
    },
    {
      key: "project-intranet.pupitre",
      kind: "project",
      name: "intranet",
      mode: "full",
      bytes: 61_302_144,
      sha256: "c".repeat(64),
      git: {
        repo: "git@github.com:acme/intranet.git",
        branch: "feat/factures",
        dirty: 3,
        ahead: 2,
      },
    },
    {
      key: "path-claude.pupitre",
      kind: "path",
      path: ".claude",
      bytes: 20_480,
      sha256: "d".repeat(64),
    },
  ],
  warnings: [],
}

describe("the manifest", () => {
  test("reads a manifest with every kind of part", () => {
    const parsed = BackupManifestSchema.parse(manifest)

    expect(parsed.parts.map((part) => part.kind)).toEqual([
      "setup",
      "home",
      "database",
      "project",
      "path",
    ])
  })

  test("refuses a format it does not know", () => {
    expect(
      BackupManifestSchema.safeParse({ ...manifest, format: 2 }).success
    ).toBe(false)
  })

  test("an identifier sorts by time", () => {
    expect(BackupIdSchema.safeParse("20260919T031500Z-7f3a2c").success).toBe(
      true
    )
    expect(BackupIdSchema.safeParse("2026-09-19-7f3a2c").success).toBe(false)
  })
})

describe("what the settings leave out", () => {
  const database = new RegExp(BACKUP_DATABASE_ITEM_PATTERN)

  test.each(["postgres:shop", "mysql:intranet", "mongodb:app-2", "redis:*"])(
    "names %s",
    (item) => {
      expect(database.test(item)).toBe(true)
    }
  )

  test.each(["shop", "postgres:*", "redis:cache", "mysql:a b", "sqlite:x"])(
    "refuses %s",
    (item) => {
      expect(database.test(item)).toBe(false)
    }
  )

  test("a manifest says what it left out, and one made before says nothing", () => {
    expect(
      BackupManifestSchema.safeParse({
        ...manifest,
        excluded: { projects: ["billing"], databases: ["mysql:legacy"] },
      }).success
    ).toBe(true)
    expect(BackupManifestSchema.safeParse(manifest).success).toBe(true)
  })
})

describe("an extra path", () => {
  const pattern = new RegExp(BACKUP_EXTRA_PATH_PATTERN)

  test.each([".claude", "notes", "notes/2026", ".config/zed/", "a.b/c..d"])(
    "takes %s",
    (path) => {
      expect(pattern.test(path)).toBe(true)
    }
  )

  test.each([
    "/etc",
    "..",
    "../root",
    "notes/../..",
    ".",
    "a//b",
    "notes/./x",
    "",
  ])("refuses %s", (path) => {
    expect(pattern.test(path)).toBe(false)
  })
})

describe("the location and the declaration", () => {
  const location = {
    endpoint: "https://abc.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "pupitre-backups",
    key: "pupitre/srv_1/20260919T031500Z-7f3a2c",
    path_style: true,
    sha256: "e".repeat(64),
  }

  test("takes an R2 location", () => {
    expect(BackupLocationSchema.safeParse(location).success).toBe(true)
  })

  test.each([
    ["an endpoint that is not an address", { endpoint: "abc" }],
    [
      "a plain HTTP endpoint, whose signatures would cross in clear",
      { endpoint: "http://abc.r2.cloudflarestorage.com" },
    ],
    [
      "an endpoint with a query",
      { endpoint: "https://abc.r2.cloudflarestorage.com?x=1" },
    ],
    ["a bucket that would step out of its path", { bucket: "b/../other" }],
    ["a bucket in capitals", { bucket: "Backups" }],
    ["a region with a space", { region: "eu west" }],
  ])("refuses %s", (_name, change) => {
    expect(
      BackupLocationSchema.safeParse({ ...location, ...change }).success
    ).toBe(false)
  })

  test("takes an AWS location", () => {
    expect(
      BackupLocationSchema.safeParse({
        ...location,
        endpoint: "https://s3.eu-west-3.amazonaws.com",
        region: "eu-west-3",
        bucket: "acme.backups-2026",
      }).success
    ).toBe(true)
  })

  test("a declaration names the manifest's digest", () => {
    const declaration = {
      id: manifest.id,
      created_at: manifest.created_at,
      trigger: "manual",
      bytes: 1,
      counts: { setup: true, home: false, databases: 0, projects: 0, paths: 0 },
      config_revision: 7,
      agent_version: "0.8.0",
      recipient: manifest.recipient,
      kdf_salt: manifest.kdf.salt,
      location,
    }

    expect(BackupDeclarationSchema.safeParse(declaration).success).toBe(true)

    const { sha256: _sha256, ...unsigned } = location

    expect(
      BackupDeclarationSchema.safeParse({ ...declaration, location: unsigned })
        .success
    ).toBe(false)
  })
})

describe("the name of a manual backup", () => {
  test.each(["Avant la migration", "v2 — prod", "a"])("takes %j", (name) => {
    expect(BackupNameSchema.safeParse(name).success).toBe(true)
  })

  test.each([
    ["an empty name", ""],
    ["a space at either end", " avant "],
    ["a control character", "avant\nmigration"],
    ["more than 80 characters", "x".repeat(81)],
  ])("refuses %s", (_what, name) => {
    expect(BackupNameSchema.safeParse(name).success).toBe(false)
  })
})
