import { describe, expect, it } from "bun:test";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { attachControl, type Spawn } from "../tmux-attach";
import { STATE_COMMAND } from "../tmux-control";

interface FakeSsh {
  spawn: Spawn;
  argv: () => string[];
  /** Every command line tmux was sent, in order. */
  commands: () => string[];
  say: (text: string) => void;
  complain: (text: string) => void;
  close: (code: number) => void;
  killed: () => boolean;
}

function fakeSsh(): FakeSsh {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    kill: () => {
      killed = true;

      return true;
    },
    stderr,
    stdin,
    stdout,
  });
  const written: string[] = [];
  let argv: string[] = [];
  let killed = false;

  stdin.on("data", (chunk: Buffer) => written.push(chunk.toString("utf8")));

  return {
    argv: () => argv,
    close: (code) => child.emit("close", code),
    commands: () => written.join("").split("\n").filter(Boolean),
    complain: (text) => stderr.write(text),
    killed: () => killed,
    say: (text) => stdout.write(text),
    spawn: (command, args) => {
      argv = [command, ...args];

      return child as unknown as ChildProcessWithoutNullStreams;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function reply(number: number, ...body: string[]): string {
  return [`%begin 1 ${number} 1`, ...body, `%end 1 ${number} 1`, ""].join("\n");
}

const STATE_LINE = STATE_COMMAND.match(/#\{\w+\}/g)
  ?.map((field) => {
    if (field === "#{pane_id}") {
      return "%4";
    }

    return field === "#{wrap_flag}" || field === "#{cursor_flag}" ? "1" : "0";
  })
  .join("|") as string;

function opened(transient = false) {
  const ssh = fakeSsh();
  const heard: { data: string; replay: boolean }[] = [];
  const ended: number[] = [];
  const transport = attachControl(
    {
      cols: 100,
      history: 8000,
      rows: 30,
      target: ["-F", "/app/ssh/config", "pupitre-srv-1"],
      tmux: "new-session -A -s shell-web-t1",
      transient,
    },
    ssh.spawn
  );

  transport.onData((data, replay) => heard.push({ data, replay }));
  transport.onExit((code) => ended.push(code));

  return { ended, heard, ssh, transport };
}

/** The attach's own block, then one reply per command the client sent, in order. */
function answerAttach(ssh: FakeSsh, transient: boolean): void {
  ssh.say("%begin 1 1 0\n%end 1 1 0\n");

  const replies = [
    reply(2),
    ...(transient ? [reply(3)] : []),
    reply(4, "\x1b[1mhistoire\x1b[0m"),
    reply(5, "$ ls", "", ""),
    "%begin 1 6 1\n%error 1 6 1\n",
    reply(7, STATE_LINE),
  ];

  for (const answer of replies) {
    ssh.say(answer);
  }
}

describe("a control-mode attach", () => {
  it("runs tmux in control mode over ssh without a terminal", () => {
    const { ssh } = opened();

    expect(ssh.argv()).toEqual([
      "ssh",
      "-T",
      "-F",
      "/app/ssh/config",
      "pupitre-srv-1",
      "tmux -u -C new-session -x 100 -y 30 -A -s shell-web-t1",
    ]);
  });

  it("sizes the client, then asks for the history, the screens and the modes", () => {
    const { ssh } = opened();

    expect(ssh.commands()).toEqual([
      "refresh-client -C 100,30",
      "capture-pane -p -e -J -S -8000 -E -1",
      "capture-pane -p -e -N",
      "capture-pane -p -e -N -a -q",
      STATE_COMMAND,
    ]);
  });

  it("lets a view's session end with it", () => {
    const { ssh } = opened(true);

    expect(ssh.commands()[1]).toBe("set-option destroy-unattached on");
  });

  it("draws the restored screen once, then only the watched pane's live bytes", async () => {
    const { heard, ssh } = opened(true);

    ssh.say("%output %4 d\\303\\251j\\303\\240 captur\\303\\251\n");
    answerAttach(ssh, true);
    ssh.say("%output %9 autre fen\\303\\252tre\n%output %4 \\303");
    ssh.say("\\251t\\303\n%output %4 \\251\\015\\012\n");
    await settle();

    expect(heard).toHaveLength(3);
    expect(heard[0]?.replay).toBe(true);
    expect(heard[0]?.data).toStartWith("\x1bc\x1b[1mhistoire\x1b[0m");
    expect(heard[0]?.data).toContain("$ ls");
    expect(heard.slice(1)).toEqual([
      { data: "ét", replay: false },
      { data: "é\r\n", replay: false },
    ]);
  });

  it("sends keys as bytes and a paste through tmux's buffer", () => {
    const { ssh, transport } = opened();

    transport.write("\x03");
    transport.write("\x1b[200~echo $HOME\x1b[201~");
    transport.resize(120, 40);
    transport.clearHistory();

    expect(ssh.commands().slice(-5)).toEqual([
      "send-keys -H 03",
      'set-buffer -b pupitre-paste "echo \\$HOME"',
      "paste-buffer -p -r -d -b pupitre-paste",
      "refresh-client -C 120,40",
      "clear-history",
    ]);
  });

  it("shows what ssh or tmux said on the way out, then reports the exit code", async () => {
    const { ended, heard, ssh } = opened();

    ssh.complain(
      "ssh: connect to host 203.0.113.7 port 22: Connection refused\n"
    );
    await settle();
    ssh.close(255);

    expect(heard).toEqual([
      {
        data: "ssh: connect to host 203.0.113.7 port 22: Connection refused\r\n",
        replay: false,
      },
    ]);
    expect(ended).toEqual([255]);
  });

  it("detaches by closing tmux's input, and only kills ssh if it lingers", async () => {
    const { ssh, transport } = opened();
    const before = ssh.commands().length;

    transport.kill();
    transport.write("trop tard");

    expect(ssh.commands()).toHaveLength(before);
    expect(ssh.killed()).toBe(false);
  });
});
