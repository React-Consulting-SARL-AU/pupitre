/**
 * The rows of a journal captured from a terminal, as a terminal would show them.
 *
 * What a process writes is not a list of lines: a download counter comes back
 * on its own line with a carriage return, Gradle redraws its progress area by
 * moving the cursor up, a build erases to the end of the line before writing
 * the next figure. Stripping those sequences glues every redraw into one long
 * line; honouring them keeps one row per line, rewritten in place. Colours
 * and everything else the sequences say are dropped: the journal is read in
 * one ink.
 *
 * The rows are bounded, and each row is replaced rather than mutated when its
 * text changes, so a screen keyed on the ids only redraws what moved.
 */

export interface JournalRow {
  id: number;
  text: string;
}

const ESCAPE = "\x1b";

const TAB_STOP = 8;

// biome-ignore lint/suspicious/noControlCharactersInRegex: the control bytes are what a terminal acts on, and finding them is the point
const CONTROL = /[\x00-\x1f\x7f]/g;

const CSI_PARAMETER = /[0-9;?]/;

const CSI_INTERMEDIATE = /[ -/]/;

export class JournalBuffer {
  private readonly rows: JournalRow[] = [];
  private readonly limit: number;
  private row = 0;
  private col = 0;
  private next = 1;
  /** How many rows the bound has cut from the top since the buffer was opened. */
  dropped = 0;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** One event of the follow: a line the process wrote, its newline implied. */
  write(line: string): void {
    this.feed(line);
    this.newline();
  }

  snapshot(): readonly JournalRow[] {
    return this.rows.slice();
  }

  get length(): number {
    return this.rows.length;
  }

  private feed(text: string): void {
    let at = 0;

    while (at < text.length) {
      CONTROL.lastIndex = at;
      const control = CONTROL.exec(text)?.index ?? text.length;

      if (control > at) {
        this.put(text.slice(at, control));
      }

      if (control === text.length) {
        break;
      }

      at = this.control(text, control);
    }
  }

  /** Handles the control character at `at` and says where the text resumes. */
  private control(text: string, at: number): number {
    switch (text[at]) {
      case "\n":
        this.newline();
        return at + 1;
      case "\r":
        this.col = 0;
        return at + 1;
      case "\b":
        this.col = Math.max(0, this.col - 1);
        return at + 1;
      case "\t":
        this.put(" ".repeat(TAB_STOP - (this.col % TAB_STOP)));
        return at + 1;
      case ESCAPE:
        return this.escape(text, at + 1);
      default:
        return at + 1;
    }
  }

  private escape(text: string, at: number): number {
    const kind = text[at];

    if (kind === "[") {
      return this.csi(text, at + 1);
    }

    if (kind === "]") {
      const bell = text.indexOf("\x07", at);
      const terminator = text.indexOf(`${ESCAPE}\\`, at);
      const ends = [bell, terminator].filter((index) => index !== -1);

      if (ends.length === 0) {
        return text.length;
      }

      const end = Math.min(...ends);

      return end === bell ? end + 1 : end + 2;
    }

    if (kind === "(" || kind === ")") {
      return Math.min(text.length, at + 2);
    }

    return Math.min(text.length, at + 1);
  }

  private csi(text: string, from: number): number {
    let at = from;

    while (at < text.length && CSI_PARAMETER.test(text[at] ?? "")) {
      at += 1;
    }

    while (at < text.length && CSI_INTERMEDIATE.test(text[at] ?? "")) {
      at += 1;
    }

    const final = text[at];

    if (final === undefined) {
      return text.length;
    }

    const params = text.slice(from, at);

    if (!params.startsWith("?")) {
      this.apply(final, params.split(";").map(Number));
    }

    return at + 1;
  }

  private apply(final: string, params: readonly number[]): void {
    const first = params[0] || 0;
    const count = Math.max(1, first);

    switch (final) {
      case "A":
        this.row = Math.max(0, this.row - count);
        break;
      case "B":
        this.row += count;
        break;
      case "C":
        this.col += count;
        break;
      case "D":
        this.col = Math.max(0, this.col - count);
        break;
      case "E":
        this.row += count;
        this.col = 0;
        break;
      case "F":
        this.row = Math.max(0, this.row - count);
        this.col = 0;
        break;
      case "G":
        this.col = count - 1;
        break;
      case "H":
      case "f":
        this.freshPage();
        break;
      case "J":
        this.eraseBelow(first);
        break;
      case "K":
        this.eraseInLine(first);
        break;
      case "P":
        this.spliceInLine(count, "");
        break;
      case "X":
        this.spliceInLine(count, " ".repeat(count));
        break;
      default:
        break;
    }
  }

  private put(run: string): void {
    const current = this.ensured();
    const text = current.text;
    const filled =
      this.col >= text.length
        ? text.padEnd(this.col) + run
        : text.slice(0, this.col) + run + text.slice(this.col + run.length);

    this.replace(filled);
    this.col += run.length;
  }

  /** The row below exists once something lands on it: a journal never ends on the cursor's empty line. */
  private newline(): void {
    this.row += 1;
    this.col = 0;
  }

  /** A screen wiped by the process starts a page of its own, below what it wrote before. */
  private freshPage(): void {
    this.row = this.rows.length;
    this.col = 0;
  }

  private eraseBelow(mode: number): void {
    if (mode >= 2) {
      this.freshPage();
      return;
    }

    if (mode === 0) {
      this.eraseInLine(0);
      this.rows.length = Math.min(this.rows.length, this.row + 1);
    }
  }

  private eraseInLine(mode: number): void {
    if (this.row >= this.rows.length) {
      return;
    }

    const text = this.ensured().text;

    if (mode === 1) {
      this.replace(
        " ".repeat(Math.min(this.col + 1, text.length)) +
          text.slice(this.col + 1)
      );
    } else if (mode === 2) {
      this.replace("");
    } else {
      this.replace(text.slice(0, this.col));
    }
  }

  private spliceInLine(count: number, filler: string): void {
    const text = this.rows[this.row]?.text ?? "";

    if (this.col < text.length) {
      this.replace(
        text.slice(0, this.col) + filler + text.slice(this.col + count)
      );
    }
  }

  private replace(text: string): void {
    const current = this.ensured();

    if (current.text !== text) {
      this.rows[this.row] = { id: current.id, text };
    }
  }

  /** The row under the cursor, created — with the ones above it — when the cursor went past the end. */
  private ensured(): JournalRow {
    while (this.rows.length <= this.row) {
      this.rows.push({ id: this.next, text: "" });
      this.next += 1;
    }

    this.bound();

    return this.rows[this.row] as JournalRow;
  }

  private bound(): void {
    const excess = this.rows.length - this.limit;

    if (excess > 0) {
      this.rows.splice(0, excess);
      this.row = Math.max(0, this.row - excess);
      this.dropped += excess;
    }
  }
}

/** A start or stop the agent wrote into the journal, with its moment. */
export interface JournalMark {
  kind: "up" | "down";
  at: string;
}

const MARK = /^=== pupitre (up|down) (\S+) ===$/;

export function markOf(text: string): JournalMark | null {
  const match = MARK.exec(text);

  return match
    ? { kind: match[1] as JournalMark["kind"], at: match[2] ?? "" }
    : null;
}

/** The rows that carry the term, case aside; an empty term keeps them all. */
export function matchingRows<R extends { text: string }>(
  rows: readonly R[],
  term: string
): readonly R[] {
  const wanted = term.trim().toLowerCase();

  return wanted
    ? rows.filter((row) => row.text.toLowerCase().includes(wanted))
    : rows;
}
