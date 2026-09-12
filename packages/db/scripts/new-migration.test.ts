import { describe, expect, it } from "bun:test"
import { forD1, nextFileName } from "./new-migration"

describe("the next migration file", () => {
  it("follows the last number and keeps D1 out of the foreign-keys pragma", () => {
    expect(nextFileName([], "init")).toBe("0001_init.sql")
    expect(nextFileName(["0001_init.sql", "0002_x.sql"], "add-notes")).toBe(
      "0003_add_notes.sql"
    )
    expect(
      forD1(
        "PRAGMA defer_foreign_keys=ON;\nPRAGMA foreign_keys=OFF;\nCREATE TABLE x (id TEXT);\nPRAGMA foreign_keys=ON;\nPRAGMA defer_foreign_keys=OFF;\n"
      )
    ).toBe(
      "PRAGMA defer_foreign_keys=ON;\nCREATE TABLE x (id TEXT);\nPRAGMA defer_foreign_keys=OFF;\n"
    )
  })
})
