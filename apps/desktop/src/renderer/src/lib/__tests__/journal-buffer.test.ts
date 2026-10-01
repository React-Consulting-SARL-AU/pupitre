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

describe("the journal buffer", () => {
  it("keeps one entry per line, empty ones included", () => {
    expect(texts(filled(["one", "", "three"]))).toEqual(["one", "", "three"]);
  });

  it("restarts the line on carriage return, like a download counter", () => {
    const buffer = filled([
      "12.8 KiB/56.5 KiB\r40.1 KiB/56.5 KiB\r56.5 KiB/56.5 KiB downloaded",
    ]);

    expect(texts(buffer)).toEqual(["56.5 KiB/56.5 KiB downloaded"]);
  });

  it("erases to the end of the line when the new one is shorter", () => {
    const buffer = filled([`a long progress line\r${ESC}[Kdone`]);

    expect(texts(buffer)).toEqual(["done"]);
  });

  it("leaves the end of the old line when nothing erases it, like a terminal", () => {
    expect(texts(filled(["abcdef\rXY"]))).toEqual(["XYcdef"]);
  });

  it("rewrites the line above when the cursor moves up to it, the way Gradle does", () => {
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

  it("drops colours and the sequences it does not follow", () => {
    const buffer = filled([
      `${ESC}[32mready${ESC}[0m in ${ESC}[1m120 ms${ESC}[22m${ESC}[?25l${ESC}]0;title${BELL}`,
    ]);

    expect(texts(buffer)).toEqual(["ready in 120 ms"]);
  });

  it("opens a fresh page when the process clears the screen, losing nothing", () => {
    const buffer = filled([
      "first run",
      `${ESC}[2J${ESC}[3J${ESC}[Hsecond run`,
    ]);

    expect(texts(buffer)).toEqual(["first run", "second run"]);
  });

  it("aligns a tab on the next column", () => {
    expect(texts(filled(["a\tb"]))).toEqual(["a       b"]);
  });

  it("caps the lines and counts what it cut", () => {
    const buffer = filled(["1", "2", "3", "4", "5"], 3);

    expect(texts(buffer)).toEqual(["3", "4", "5"]);
    expect(buffer.dropped).toBe(2);
  });

  it("replaces a rewritten line and leaves the others as they are", () => {
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

describe("journal marks", () => {
  it("read a start and a stop written by the agent", () => {
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

describe("search", () => {
  it("keeps the lines that carry the term, case aside", () => {
    const rows = [
      { id: 1, text: "Listening on :3000" },
      { id: 2, text: "error: boom" },
      { id: 3, text: "ERROR again" },
    ];

    expect(matchingRows(rows, "error").map((row) => row.id)).toEqual([2, 3]);
    expect(matchingRows(rows, "  ")).toBe(rows);
  });
});
