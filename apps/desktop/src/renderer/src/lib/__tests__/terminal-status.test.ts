import { describe, expect, it } from "bun:test";
import {
  forgetStatus,
  noteStatus,
  statusOf,
  UNKNOWN_STATUS,
} from "../terminal-status";

describe("le statut d'un terminal", () => {
  it("part d'un inconnu qui se dit en bas", () => {
    expect(statusOf("t-none")).toEqual(UNKNOWN_STATUS);
  });

  it("retient la taille, le dossier et la recherche séparément", () => {
    noteStatus("t1", { cols: 120, rows: 40 });
    noteStatus("t1", { dir: "/home/dev/flyleaf-api" });
    noteStatus("t1", { matches: { count: 3, index: 1 } });

    expect(statusOf("t1")).toEqual({
      atBottom: true,
      cols: 120,
      dir: "/home/dev/flyleaf-api",
      matches: { count: 3, index: 1 },
      rows: 40,
    });
  });

  it("oublie tout d'une session fermée", () => {
    noteStatus("t2", { atBottom: false });
    forgetStatus("t2");

    expect(statusOf("t2")).toEqual(UNKNOWN_STATUS);
  });
});
