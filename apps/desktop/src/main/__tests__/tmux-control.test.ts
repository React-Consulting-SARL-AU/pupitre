import { describe, expect, it } from "bun:test";
import { Terminal } from "@xterm/headless";
import { tmuxArguments } from "../terminal-run";
import {
  type ControlEvent,
  ControlParser,
  controlLine,
  decodeOutput,
  keysCommands,
  type PaneState,
  parseState,
  pasteCommands,
  pasted,
  restoreSequence,
  STATE_COMMAND,
  tmuxQuoted,
} from "../tmux-control";

const lines = (...text: string[]) => text.map((line) => Buffer.from(line));

function feed(...chunks: string[]): ControlEvent[] {
  const parser = new ControlParser();

  return chunks.flatMap((chunk) => parser.feed(Buffer.from(chunk, "utf8")));
}

const STATE: PaneState = {
  alternate_on: 0,
  cursor_flag: 1,
  cursor_x: 0,
  cursor_y: 0,
  insert_flag: 0,
  keypad_cursor_flag: 0,
  keypad_flag: 0,
  mouse_all_flag: 0,
  mouse_button_flag: 0,
  mouse_sgr_flag: 0,
  mouse_standard_flag: 0,
  mouse_utf8_flag: 0,
  origin_flag: 0,
  pane_height: 3,
  pane_id: "%4",
  scroll_region_lower: 2,
  scroll_region_upper: 0,
  wrap_flag: 1,
};

async function drawn(sequence: string, cols = 20, rows = 3) {
  const terminal = new Terminal({ allowProposedApi: true, cols, rows });

  await new Promise<void>((resolve) => terminal.write(sequence, resolve));

  const buffer = terminal.buffer.active;
  const rowsRead: string[] = [];

  for (let y = 0; y < buffer.length; y++) {
    rowsRead.push(buffer.getLine(y)?.translateToString(true) ?? "");
  }

  return { buffer, modes: terminal.modes, rows: rowsRead };
}

describe("the control stream", () => {
  it("hands back the program's own bytes, escape sequences and accents included", () => {
    const [event] = feed(
      "%output %4 \\033[32mvert\\033[0m \\134 é\\015\\012\n"
    );

    expect(event).toEqual({
      data: Buffer.from("\x1b[32mvert\x1b[0m \\ é\r\n"),
      kind: "output",
      pane: "%4",
    });
  });

  it("joins a line cut between two reads, even inside a multibyte character", () => {
    const whole = Buffer.from("%output %1 été\n");
    const parser = new ControlParser();
    const events = [
      ...parser.feed(whole.subarray(0, 13)),
      ...parser.feed(whole.subarray(13)),
    ];

    expect(events).toEqual([
      { data: Buffer.from("été"), kind: "output", pane: "%1" },
    ]);
  });

  it("collects a reply whole, says whose it is, and only closes it on its own stamp", () => {
    const events = feed(
      "%begin 1794226436 287 0\n%end 1794226436 287 0\n",
      "%begin 1794226436 288 1\n",
      "%end 1 2 1\n%output %9 pas une sortie\nligne\n",
      "%end 1794226436 288 1\n",
      "%begin 1794226436 289 1\nrefusé\n%error 1794226436 289 1\n%exit\n"
    );

    expect(events).toEqual([
      { kind: "reply", lines: [], ok: true, ours: false },
      {
        kind: "reply",
        lines: lines("%end 1 2 1", "%output %9 pas une sortie", "ligne"),
        ok: true,
        ours: true,
      },
      { kind: "reply", lines: lines("refusé"), ok: false, ours: true },
      { kind: "exit" },
    ]);
  });

  it("leaves a backslash that starts no octal escape as it is", () => {
    expect(decodeOutput(Buffer.from("a\\9b\\0"))).toEqual(
      Buffer.from("a\\9b\\0")
    );
  });
});

describe("what the reader sends", () => {
  it("sends keys as bytes, so Ctrl-C and arrows reach the program untouched", () => {
    expect(keysCommands("\x03\x1b[Aé")).toEqual([
      "send-keys -H 03 1b 5b 41 c3 a9",
    ]);
  });

  it("splits a long burst of keys into several commands", () => {
    expect(keysCommands("a".repeat(600))).toHaveLength(3);
  });

  it("quotes a paste so tmux expands nothing and the line never breaks", () => {
    expect(tmuxQuoted('a$HOME "x" \\ é\r\n\x1b')).toBe(
      '"a\\$HOME \\"x\\" \\\\ é\\015\\012\\033"'
    );
  });

  it("hands a paste to tmux, which brackets it only if the program asked", () => {
    const text = pasted("\x1b[200~ls -la\rpwd\x1b[201~");

    expect(text).toBe("ls -la\rpwd");
    expect(pasteCommands(text as string)).toEqual([
      'set-buffer -b pupitre-paste "ls -la\\015pwd"',
      "paste-buffer -p -r -d -b pupitre-paste",
    ]);
    expect(pasted("ls")).toBeNull();
  });

  it("appends a long paste piece by piece to the same buffer", () => {
    const commands = pasteCommands("x".repeat(9000));

    expect(commands).toHaveLength(4);
    expect(commands[1]).toStartWith("set-buffer -b pupitre-paste -a ");
  });
});

describe("the attach", () => {
  it("sizes a session the attach creates, and only that", () => {
    expect(
      controlLine("new-session -A -s shell-web-t1 -c /home/dev/web", {
        cols: 132,
        rows: 40,
      })
    ).toBe(
      "tmux -u -C new-session -x 132 -y 40 -A -s shell-web-t1 -c /home/dev/web"
    );
    expect(
      controlLine("attach-session -t =pupitre-view-1a2b", {
        cols: 132,
        rows: 40,
      })
    ).toBe("tmux -u -C attach-session -t =pupitre-view-1a2b");
  });

  it("takes from the agent only a line that runs tmux", () => {
    expect(tmuxArguments("tmux new-session -A -s claude-web claude")).toBe(
      "new-session -A -s claude-web claude"
    );
    expect(tmuxArguments("rm -rf ~ ; tmux new-session")).toBeNull();
    expect(tmuxArguments("tmux kill-server")).toBeNull();
  });

  it("reads the pane's modes from one line, and refuses anything else", () => {
    const fields = STATE_COMMAND.match(/#\{\w+\}/g) ?? [];
    const line = fields
      .map((field) => (field === "#{pane_id}" ? "%7" : "1"))
      .join("|");

    expect(parseState(line)).toMatchObject({ alternate_on: 1, pane_id: "%7" });
    expect(parseState("can't find pane")).toBeNull();
  });
});

describe("the screen redrawn at the attach", () => {
  it("puts the history in the scrollback and the screen where it was, cursor included", async () => {
    const { buffer, rows } = await drawn(
      restoreSequence({
        history: lines("un", "deux"),
        saved: [],
        screen: lines("trois", "$ ls", ""),
        state: { ...STATE, cursor_x: 4, cursor_y: 1 },
      })
    );

    expect(rows).toEqual(["un", "deux", "trois", "$ ls", ""]);
    expect(buffer.type).toBe("normal");
    expect([buffer.cursorX, buffer.cursorY]).toEqual([4, 1]);
  });

  it("brings back a full-screen program over the screen it hides", async () => {
    const { buffer, modes, rows } = await drawn(
      restoreSequence({
        history: lines("avant"),
        saved: lines("$ turbo dev", "", ""),
        screen: lines("┌ web ─┐", "│ ready│", "└──────┘"),
        state: {
          ...STATE,
          alternate_on: 1,
          cursor_flag: 0,
          keypad_cursor_flag: 1,
          mouse_all_flag: 1,
          mouse_sgr_flag: 1,
        },
      })
    );

    expect(buffer.type).toBe("alternate");
    expect(rows).toEqual(["┌ web ─┐", "│ ready│", "└──────┘"]);
    expect(modes.mouseTrackingMode).toBe("any");
    expect(modes.applicationCursorKeysMode).toBe(true);
    expect(modes.bracketedPasteMode).toBe(true);
  });

  it("starts from a blank terminal, so a reattach never doubles the scrollback", async () => {
    const sequence = restoreSequence({
      history: lines("un"),
      saved: [],
      screen: lines("deux", "", ""),
      state: STATE,
    });
    const { rows } = await drawn(sequence + sequence);

    expect(rows.filter((row) => row === "un")).toHaveLength(1);
  });
});
