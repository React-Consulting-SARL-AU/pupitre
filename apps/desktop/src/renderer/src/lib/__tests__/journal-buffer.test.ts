import { describe, expect, it } from "bun:test";
import { JournalBuffer, markOf, matchingRows } from "../journal-buffer";

const ESC = "\x1b";

const BELL = "\x07";

function texts(buffer: JournalBuffer): string[] {
  return buffer.snapshot().map((row) => row.text);
}

function filled(lines: string[], limit = 100): JournalBuffer {
  const buffer = new JournalBuffer(limit);

  for (const line of lines) {
    buffer.write(line);
  }

  return buffer;
}

describe("le tampon du journal", () => {
  it("garde une ligne par ligne, les vides comprises", () => {
    expect(texts(filled(["one", "", "three"]))).toEqual(["one", "", "three"]);
  });

  it("recommence la ligne au retour chariot, comme un compteur de téléchargement", () => {
    const buffer = filled([
      "12.8 KiB/56.5 KiB\r40.1 KiB/56.5 KiB\r56.5 KiB/56.5 KiB downloaded",
    ]);

    expect(texts(buffer)).toEqual(["56.5 KiB/56.5 KiB downloaded"]);
  });

  it("efface jusqu'au bout de la ligne quand la nouvelle est plus courte", () => {
    const buffer = filled([`a long progress line\r${ESC}[Kdone`]);

    expect(texts(buffer)).toEqual(["done"]);
  });

  it("laisse la fin de l'ancienne ligne sans effacement, comme un terminal", () => {
    expect(texts(filled(["abcdef\rXY"]))).toEqual(["XYcdef"]);
  });

  it("réécrit la ligne du dessus quand le curseur y remonte, à la façon de Gradle", () => {
    const buffer = filled([
      "> Task :compile",
      `<=====-----> 40% EXECUTING [1s]${ESC}[1A\r${ESC}[K> Task :compile done`,
      `\r${ESC}[K<======----> 50% EXECUTING [2s]`,
    ]);

    expect(texts(buffer)).toEqual([
      "> Task :compile done",
      "<======----> 50% EXECUTING [2s]",
    ]);
  });

  it("jette les couleurs et les séquences qu'elle ne suit pas", () => {
    const buffer = filled([
      `${ESC}[32mready${ESC}[0m in ${ESC}[1m120 ms${ESC}[22m${ESC}[?25l${ESC}]0;title${BELL}`,
    ]);

    expect(texts(buffer)).toEqual(["ready in 120 ms"]);
  });

  it("ouvre une page neuve quand le processus efface l'écran, sans rien perdre", () => {
    const buffer = filled([
      "first run",
      `${ESC}[2J${ESC}[3J${ESC}[Hsecond run`,
    ]);

    expect(texts(buffer)).toEqual(["first run", "second run"]);
  });

  it("aligne une tabulation sur la colonne suivante", () => {
    expect(texts(filled(["a\tb"]))).toEqual(["a       b"]);
  });

  it("borne les lignes et compte ce qu'elle a coupé", () => {
    const buffer = filled(["1", "2", "3", "4", "5"], 3);

    expect(texts(buffer)).toEqual(["3", "4", "5"]);
    expect(buffer.dropped).toBe(2);
  });

  it("remplace une ligne réécrite et laisse les autres telles quelles", () => {
    const buffer = filled(["kept", "rewritten"]);
    const before = buffer.snapshot();

    buffer.write(`${ESC}[1A\r${ESC}[Knew`);

    const after = buffer.snapshot();

    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]?.id).toBe(before[1]?.id ?? -1);
    expect(after[1]?.text).toBe("new");
  });
});

describe("les marques du journal", () => {
  it("lisent un démarrage et un arrêt écrits par l'agent", () => {
    expect(markOf("=== pupitre up 2026-09-18T10:00:05Z ===")).toEqual({
      kind: "up",
      at: "2026-09-18T10:00:05Z",
    });
    expect(markOf("=== pupitre down 2026-09-18T10:00:01Z ===")).toEqual({
      kind: "down",
      at: "2026-09-18T10:00:01Z",
    });
    expect(markOf("=== pupitre up ===")).toBeNull();
    expect(markOf("hello")).toBeNull();
  });
});

describe("la recherche", () => {
  it("garde les lignes qui portent le terme, majuscules à part", () => {
    const rows = [
      { id: 1, text: "Listening on :3000" },
      { id: 2, text: "error: boom" },
      { id: 3, text: "ERROR again" },
    ];

    expect(matchingRows(rows, "error").map((row) => row.id)).toEqual([2, 3]);
    expect(matchingRows(rows, "  ")).toBe(rows);
  });
});
