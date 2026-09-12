import { describe, expect, it } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  commandOf,
  environmentOf,
  fieldsToEnv,
  readEnvironments,
} from "../environments"

const CONFIG = JSON.stringify({
  vault: "Vault",
  environments: {
    local: { item: "note" },
    production: { item: "note-prod", database: "ppt-db" },
  },
})

function written(): string {
  const file = join(mkdtempSync(join(tmpdir(), "pupitre-env-")), "e.json")

  writeFileSync(file, CONFIG)

  return file
}

describe("the environments", () => {
  it("names each one's note and database, and refuses any other name", () => {
    const config = readEnvironments(written())

    expect(config.vault).toBe("Vault")
    expect(environmentOf("production", config)).toEqual({
      database: "ppt-db",
      item: "note-prod",
      name: "production",
    })
    expect(() => environmentOf("prod", config)).toThrow(
      "prod is not an environment: local or production."
    )
  })

  it("reads the committed file", () => {
    const config = readEnvironments()

    expect(Object.keys(config.environments).sort()).toEqual([
      "local",
      "production",
    ])
    expect(config.environments.local?.database).toBeUndefined()
    expect(config.environments.production?.database).toBe("ppt-db")
  })
})

describe("what a note gives a command", () => {
  it("takes every named field with a value, and not the note's body", () => {
    expect(
      fieldsToEnv({
        fields: [
          { label: "DATABASE_URL", value: "postgres://x" },
          { label: "notesPlain", value: "ignored" },
          { label: "EMPTY", value: "" },
          { label: "NO_VALUE" },
          { value: "no label" },
          { label: "PUPITRE_PUBLISH_TOKEN", value: "pupitre_pub_x" },
        ],
      })
    ).toEqual({
      DATABASE_URL: "postgres://x",
      PUPITRE_PUBLISH_TOKEN: "pupitre_pub_x",
    })
  })

  it("reads the environment and the command off the line, with or without --", () => {
    expect(commandOf(["production", "--", "bun", "run", "x"])).toEqual({
      argv: ["bun", "run", "x"],
      name: "production",
    })
    expect(commandOf(["local", "prisma", "studio"])).toEqual({
      argv: ["prisma", "studio"],
      name: "local",
    })
    expect(() => commandOf(["local"])).toThrow("usage")
    expect(() => commandOf([])).toThrow("usage")
  })
})
