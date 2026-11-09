import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  type Captured,
  type ControlEvent,
  ControlParser,
  controlLine,
  keysCommands,
  parseState,
  pasteCommands,
  pasted,
  resizeCommand,
  restoreCommands,
  restoreSequence,
} from "./tmux-control";

/** What a terminal tab holds: bytes in, keys out, a size, an end. */
export interface Transport {
  /** `replay` marks the screen redrawn at the attach, which the program did not just write. */
  onData(listener: (data: string, replay: boolean) => void): void;
  onExit(listener: (code: number) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** tmux's own scrollback too, or the next attach would bring the cleared lines back. */
  clearHistory(): void;
  kill(): void;
}

export interface AttachRequest {
  target: string[];
  /** The arguments after `tmux`, quoted for the remote shell. */
  tmux: string;
  cols: number;
  rows: number;
  /** Lines of scrollback the reader's terminal keeps: no more is fetched. */
  history: number;
  /** A view of someone else's window: its session ends with this client. */
  transient: boolean;
}

export type Spawn = (
  command: string,
  args: string[]
) => ChildProcessWithoutNullStreams;

const KILL_AFTER_MS = 1500;

type Reply = Extract<ControlEvent, { kind: "reply" }>;

/** tmux's control mode: the program's own bytes, so scrollback, search, selection and links stay the terminal's. */
export function attachControl(
  request: AttachRequest,
  start: Spawn = (command, args) => spawn(command, args)
): Transport {
  const child = start("ssh", [
    "-T",
    ...request.target,
    controlLine(request.tmux, request),
  ]);
  const parser = new ControlParser();
  const decoder = new TextDecoder("utf-8");
  const pending: ((reply: Reply) => void)[] = [];
  const captured: Partial<Omit<Captured, "state">> = {};

  let onData: (data: string, replay: boolean) => void = () => undefined;
  let onExit: (code: number) => void = () => undefined;
  let pane: string | null = null;
  let ended = false;

  function send(
    command: string,
    then: (reply: Reply) => void = () => undefined
  ): void {
    if (ended || !child.stdin.writable) {
      return;
    }

    pending.push(then);
    child.stdin.write(`${command}\n`);
  }

  function handle(event: ControlEvent): void {
    if (event.kind === "exit") {
      ended = true;
      child.stdin.end();

      return;
    }

    if (event.kind === "reply") {
      if (event.ours) {
        pending.shift()?.(event);
      }

      return;
    }

    // Until the screen is drawn, every byte is already in what the captures return.
    if (pane !== null && event.pane === pane) {
      onData(decoder.decode(event.data, { stream: true }), false);
    }
  }

  child.stdout.on("data", (chunk: Buffer) => {
    for (const event of parser.feed(chunk)) {
      handle(event);
    }
  });

  // ssh's and tmux's own words (an unreachable host, a missing session) belong on the screen.
  child.stderr.on("data", (chunk: Buffer) => {
    onData(chunk.toString("utf8").replaceAll(/\r?\n/g, "\r\n"), false);
  });

  child.on("error", () => undefined);
  child.stdin.on("error", () => undefined);

  child.on("close", (code) => {
    ended = true;
    onExit(code ?? 0);
  });

  send(resizeCommand(request.cols, request.rows));

  if (request.transient) {
    send("set-option destroy-unattached on");
  }

  const [history, screen, saved, state] = restoreCommands(request.history);

  send(history, (reply) => {
    captured.history = reply.lines;
  });
  send(screen, (reply) => {
    captured.screen = reply.lines;
  });
  send(saved, (reply) => {
    captured.saved = reply.ok ? reply.lines : [];
  });
  send(state, (reply) => {
    const read = parseState(reply.lines[0]?.toString("utf8") ?? "");

    if (!read) {
      return;
    }

    pane = read.pane_id;
    onData(
      restoreSequence({
        history: captured.history ?? [],
        saved: captured.saved ?? [],
        screen: captured.screen ?? [],
        state: read,
      }),
      true
    );
  });

  return {
    clearHistory() {
      send("clear-history");
    },
    kill() {
      if (ended) {
        return;
      }

      ended = true;
      child.stdin.end();
      setTimeout(() => child.kill(), KILL_AFTER_MS).unref();
    },
    onData(listener) {
      onData = listener;
    },
    onExit(listener) {
      onExit = listener;
    },
    resize(cols, rows) {
      send(resizeCommand(cols, rows));
    },
    write(data) {
      const text = pasted(data);
      const commands = text === null ? keysCommands(data) : pasteCommands(text);

      for (const command of commands) {
        send(command);
      }
    },
  };
}
