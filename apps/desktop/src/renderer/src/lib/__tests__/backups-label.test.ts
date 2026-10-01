import { describe, expect, it } from "bun:test";
import { translator } from "../../i18n/i18n";
import { backupLabel } from "../backups";

const t = translator("fr");

describe("a backup in a sentence", () => {
  it("is called by its name when it has one, always with its date", () => {
    const named = backupLabel(t, {
      created_at: "2026-09-24T10:15:00Z",
      name: "Avant la migration",
    });

    expect(named.startsWith("« Avant la migration » du ")).toBe(true);
    expect(
      backupLabel(t, { created_at: "2026-09-24T10:15:00Z" }).startsWith("du ")
    ).toBe(true);
  });
});
