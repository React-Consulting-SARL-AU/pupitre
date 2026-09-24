import { describe, expect, it } from "bun:test";
import { translator } from "../../i18n/i18n";
import { backupLabel } from "../backups";

const t = translator("fr");

describe("une sauvegarde dans une phrase", () => {
  it("se dit par son nom quand elle en a un, toujours avec sa date", () => {
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
