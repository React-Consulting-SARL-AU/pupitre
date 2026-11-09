const NEWLINE = 0x0a;
const BACKSLASH = 0x5c;
const ESC = "\x1b";
const OCTAL = /^[0-7]{3}$/;

const KEYS_PER_COMMAND = 256;
const PASTE_PER_COMMAND = 4096;

export const PASTE_START = `${ESC}[200~`;
export const PASTE_END = `${ESC}[201~`;

const PASTE_BUFFER = "pupitre-paste";

export type ControlEvent =
  | { kind: "output"; pane: string; data: Buffer }
  | { kind: "reply"; ours: boolean; ok: boolean; lines: Buffer[] }
  | { kind: "exit" };

interface Block {
  stamp: string;
  ours: boolean;
  lines: Buffer[];
}

/** `\ooo` for every byte below a space and for the backslash itself; the rest is the program's own bytes. */
export function decodeOutput(escaped: Buffer): Buffer {
  const out = Buffer.allocUnsafe(escaped.length);
  let length = 0;

  for (let at = 0; at < escaped.length; at++) {
    const byte = escaped[at] as number;

    if (byte === BACKSLASH && at + 3 < escaped.length) {
      const octal = escaped.toString("latin1", at + 1, at + 4);

      if (OCTAL.test(octal)) {
        out[length++] = Number.parseInt(octal, 8);
        at += 3;

        continue;
      }
    }

    out[length++] = byte;
  }

  return out.subarray(0, length);
}

const OUTPUT = Buffer.from("%output ");

function outputOf(line: Buffer): ControlEvent | null {
  if (!line.subarray(0, OUTPUT.length).equals(OUTPUT)) {
    return null;
  }

  const space = line.indexOf(0x20, OUTPUT.length);

  if (space === -1) {
    return null;
  }

  return {
    data: decodeOutput(line.subarray(space + 1)),
    kind: "output",
    pane: line.toString("latin1", OUTPUT.length, space),
  };
}

/** A command's reply is a block of raw lines, so a pane line reading "%end" closes it only with the same stamp. */
export class ControlParser {
  private rest: Buffer = Buffer.alloc(0);
  private block: Block | null = null;

  feed(chunk: Buffer): ControlEvent[] {
    const events: ControlEvent[] = [];
    let buffer =
      this.rest.length > 0 ? Buffer.concat([this.rest, chunk]) : chunk;
    let newline = buffer.indexOf(NEWLINE);

    while (newline !== -1) {
      const event = this.line(buffer.subarray(0, newline));

      if (event) {
        events.push(event);
      }

      buffer = buffer.subarray(newline + 1);
      newline = buffer.indexOf(NEWLINE);
    }

    this.rest = Buffer.from(buffer);

    return events;
  }

  private line(line: Buffer): ControlEvent | null {
    if (this.block) {
      return this.inBlock(line);
    }

    const text = line.toString("latin1", 0, Math.min(line.length, 64));

    if (text.startsWith("%begin ")) {
      const [, time, number, flags] = text.split(" ");

      this.block = {
        lines: [],
        // The low bit of the flags marks a command this client sent.
        ours: Number(flags) % 2 === 1,
        stamp: `${time} ${number}`,
      };

      return null;
    }

    if (text === "%exit" || text.startsWith("%exit ")) {
      return { kind: "exit" };
    }

    return outputOf(line);
  }

  private inBlock(line: Buffer): ControlEvent | null {
    const block = this.block as Block;
    const text = line.toString("latin1", 0, Math.min(line.length, 64));

    for (const [marker, ok] of [
      ["%end ", true],
      ["%error ", false],
    ] as const) {
      if (text.startsWith(`${marker}${block.stamp} `)) {
        this.block = null;

        return { kind: "reply", lines: block.lines, ok, ours: block.ours };
      }
    }

    block.lines.push(Buffer.from(line));

    return null;
  }
}

function hex(bytes: Buffer): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function chunks(bytes: Buffer, size: number): Buffer[] {
  const parts: Buffer[] = [];

  for (let at = 0; at < bytes.length; at += size) {
    parts.push(bytes.subarray(at, at + size));
  }

  return parts;
}

/** Bytes, never key names: what the reader typed reaches the program exactly, Ctrl-C included. */
export function keysCommands(data: string): string[] {
  return chunks(Buffer.from(data, "utf8"), KEYS_PER_COMMAND).map(
    (part) => `send-keys -H ${hex(part)}`
  );
}

/** Inside double quotes tmux would expand `$` and end on `"`; a control byte would end the command line. */
export function tmuxQuoted(text: string): string {
  const quoted: number[] = [];

  for (const byte of Buffer.from(text, "utf8")) {
    if (byte < 0x20 || byte === 0x7f) {
      quoted.push(...Buffer.from(`\\${byte.toString(8).padStart(3, "0")}`));
    } else if (byte === 0x22 || byte === 0x24 || byte === BACKSLASH) {
      quoted.push(BACKSLASH, byte);
    } else {
      quoted.push(byte);
    }
  }

  return `"${Buffer.from(quoted).toString("utf8")}"`;
}

/** tmux brackets the paste only if the program asked for it, which only tmux knows after an attach. */
export function pasteCommands(text: string): string[] {
  const parts: string[] = [];
  let piece = "";

  for (const character of text) {
    if (piece.length + character.length > PASTE_PER_COMMAND) {
      parts.push(piece);
      piece = "";
    }

    piece += character;
  }

  if (piece.length > 0) {
    parts.push(piece);
  }

  return [
    ...parts.map(
      (part, index) =>
        `set-buffer -b ${PASTE_BUFFER}${index > 0 ? " -a" : ""} ${tmuxQuoted(part)}`
    ),
    `paste-buffer -p -r -d -b ${PASTE_BUFFER}`,
  ];
}

export function pasted(data: string): string | null {
  return data.startsWith(PASTE_START) && data.endsWith(PASTE_END)
    ? data.slice(PASTE_START.length, data.length - PASTE_END.length)
    : null;
}

export function resizeCommand(cols: number, rows: number): string {
  return `refresh-client -C ${cols},${rows}`;
}

const STATE_FIELDS = [
  "pane_id",
  "alternate_on",
  "cursor_x",
  "cursor_y",
  "cursor_flag",
  "keypad_cursor_flag",
  "keypad_flag",
  "mouse_standard_flag",
  "mouse_button_flag",
  "mouse_all_flag",
  "mouse_sgr_flag",
  "mouse_utf8_flag",
  "insert_flag",
  "wrap_flag",
  "origin_flag",
  "scroll_region_upper",
  "scroll_region_lower",
  "pane_height",
] as const;

type StateField = (typeof STATE_FIELDS)[number];

export type PaneState = Record<Exclude<StateField, "pane_id">, number> & {
  pane_id: string;
};

/** The modes a program set before the attach: without them a mouse-driven TUI would ignore every click. */
export const STATE_COMMAND = `display-message -p "${STATE_FIELDS.map((field) => `#{${field}}`).join("|")}"`;

export function parseState(line: string): PaneState | null {
  const values = line.split("|");

  if (values.length !== STATE_FIELDS.length || !values[0]?.startsWith("%")) {
    return null;
  }

  const state: Record<string, string | number> = {};

  for (const [index, field] of STATE_FIELDS.entries()) {
    const value = values[index] as string;

    state[field] = field === "pane_id" ? value : Number(value) || 0;
  }

  return state as PaneState;
}

/** What the attach asks for, in this order; the screen is only drawn once the last answer is in. */
export function restoreCommands(
  history: number
): readonly [string, string, string, string] {
  return [
    `capture-pane -p -e -J -S -${history} -E -1`,
    "capture-pane -p -e -N",
    "capture-pane -p -e -N -a -q",
    STATE_COMMAND,
  ];
}

export interface Captured {
  history: Buffer[];
  screen: Buffer[];
  saved: Buffer[];
  state: PaneState;
}

const RESET = `${ESC}[0m`;

function text(lines: Buffer[]): string[] {
  return lines.map((line) => line.toString("utf8"));
}

function flag(on: number, code: string): string {
  return on ? `${ESC}[?${code}h` : "";
}

function modes(state: PaneState): string {
  const region =
    state.scroll_region_upper !== 0 ||
    state.scroll_region_lower !== state.pane_height - 1
      ? `${ESC}[${state.scroll_region_upper + 1};${state.scroll_region_lower + 1}r`
      : "";
  const row = state.origin_flag
    ? state.cursor_y - state.scroll_region_upper
    : state.cursor_y;

  return [
    region,
    flag(state.origin_flag, "6"),
    state.wrap_flag ? "" : `${ESC}[?7l`,
    state.insert_flag ? `${ESC}[4h` : "",
    flag(state.keypad_cursor_flag, "1"),
    state.keypad_flag ? `${ESC}=` : "",
    flag(state.mouse_standard_flag, "1000"),
    flag(state.mouse_button_flag, "1002"),
    flag(state.mouse_all_flag, "1003"),
    flag(state.mouse_utf8_flag, "1005"),
    flag(state.mouse_sgr_flag, "1006"),
    // Always on: a paste goes through tmux, which brackets it only for a program that asked.
    `${ESC}[?2004h`,
    state.cursor_flag ? "" : `${ESC}[?25l`,
    `${ESC}[${row + 1};${state.cursor_x + 1}H`,
  ].join("");
}

/** Scrollback, then the screen row by row, then the program's modes: the terminal reads as if it had been there all along. */
export function restoreSequence({
  history,
  screen,
  saved,
  state,
}: Captured): string {
  const normal = state.alternate_on ? saved : screen;
  const scrolled = [...text(history), ...text(normal)];
  let sequence = `${ESC}c${scrolled.map((line) => line + RESET).join("\r\n")}`;

  if (state.alternate_on) {
    sequence += `${ESC}[?1049h`;
    sequence += text(screen)
      .map((line, row) => `${ESC}[${row + 1};1H${line}${RESET}`)
      .join("");
  }

  return sequence + modes(state);
}

const SIZED = /^new-session(?= )/;

/** Sized at birth so a program started by the attach draws once, at the reader's size. */
export function controlLine(
  tmux: string,
  size: { cols: number; rows: number }
): string {
  return `tmux -u -C ${tmux.replace(SIZED, `new-session -x ${size.cols} -y ${size.rows}`)}`;
}
