import { type ChildProcess, spawn } from "node:child_process";
import type { ConnectionState, Diagnostic } from "@shared/contract";

import { active, profile } from "./servers";
import { logPath } from "@shared/profile";

/**
 * The admin command of the active server.
 *
 * It is called `dev` here; nothing forces the machine next door to call it the
 * same. It is bounded by the profile reader — what comes out of here goes into
 * a remote shell.
 */
export function command(): string {
  return profile().command;
}

/** The ssh arguments of the active server: its host, and its key if it has one. */
export function target(): string[] {
  const server = active();
  return server.key ? ["-i", server.key, server.host] : [server.host];
}

export function activeHost(): string {
  return active().host;
}

/**
 * A single ssh process, kept open, into which commands are written.
 *
 * Starting `ssh` costs nearly 200 ms on macOS — the local client, not the
 * network, and multiplexing does not change that. An interface polling every
 * second cannot afford one per call: we open a remote shell once, and every
 * command becomes a round trip on its standard input.
 */
class SshChannel {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private queue: Promise<unknown> = Promise.resolve();

  private open(): ChildProcess {
    if (this.proc && !this.proc.killed) {
      return this.proc;
    }
    const proc = spawn("ssh", [...target(), "sh"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      this.buffer += chunk;
    });
    proc.on("exit", () => {
      if (this.proc === proc) {
        this.proc = null;
      }
    });
    this.proc = proc;
    return proc;
  }

  /**
   * Commands are serialised: two concurrent reads on the same buffer would
   * steal each other's answers.
   */
  run(cmd: string, timeoutMs = 20_000): Promise<string> {
    const next = this.queue.then(() => this.send(cmd, timeoutMs));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private send(cmd: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = this.open();
      if (!proc.stdin) {
        reject(new Error("ssh channel unavailable"));
        return;
      }

      const marker = `__END_${Math.random().toString(36).slice(2)}__`;
      this.buffer = "";

      const timer = setTimeout(() => {
        clearInterval(poll);
        reject(new Error(`timed out: ${cmd}`));
      }, timeoutMs);

      const poll = setInterval(() => {
        const end = this.buffer.indexOf(marker);
        if (end === -1) {
          return;
        }
        clearInterval(poll);
        clearTimeout(timer);
        const output = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + marker.length);
        resolve(output);
      }, 12);

      proc.stdin.write(`${cmd}\nprintf '%s\\n' ${marker}\n`);
    });
  }

  close(): void {
    this.proc?.kill();
    this.proc = null;
  }
}

export const channel = new SshChannel();

/** A one-shot command, outside the channel — for the connection checks. */
function once(
  cmd: string,
  args: string[],
  timeoutMs = 12_000,
  env?: Record<string, string>
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: { ...(process.env as Record<string, string>), ...env },
    });
    let output = "";
    proc.stdout?.on("data", (d) => {
      output += d;
    });
    proc.stderr?.on("data", (d) => {
      output += d;
    });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ code: 124, output });
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, output });
    });
  });
}

/**
 * The agent `ssh` will really use, according to the configuration.
 *
 * `ssh-add` does not read ~/.ssh/config: it only knows SSH_AUTH_SOCK. An app
 * launched from the Finder inherits the system agent, which is empty, whereas an
 * `IdentityAgent` points ssh at an entirely different keyring — and the check
 * reported "no key loaded" on a connection that worked.
 */
function declaredAgent(expandedConfig: string): Record<string, string> | undefined {
  const socket = expandedConfig.match(/^identityagent (.+)$/m)?.[1].trim();

  return socket && socket !== "none"
    ? { SSH_AUTH_SOCK: socket.replace(/^"|"$/g, "") }
    : undefined;
}

/**
 * The four checks, in the order they get fixed.
 *
 * Each carries its own remedy: "it does not work" helps nobody, whereas "no key
 * in the agent" is solved in ten seconds. That is exactly the diagnosis that
 * costs the most when it is missing.
 *
 * Nothing here names a particular key manager: depending on the machine, the
 * agent is the system one, a keychain's, or an ssh-agent started by hand. The
 * app does not need to know, and guessing would mislead.
 */
export async function diagnose(): Promise<ConnectionState> {
  const diagnostics: Diagnostic[] = [];

  const host = await once("ssh", ["-G", activeHost()]);
  const declared = host.code === 0 && /^hostname \S+/m.test(host.output);
  diagnostics.push({
    ok: declared,
    step: "host",
    title: `Host ${activeHost()} is declared`,
    detail: declared
      ? (host.output.match(/^hostname (\S+)/m)?.[1] ?? activeHost())
      : `no "Host ${activeHost()}" block in ~/.ssh/config`,
    fix: "Add the host to ~/.ssh/config, or pick another one in the settings.",
  });

  if (!declared) {
    return { connected: false, host: activeHost(), diagnostics };
  }

  const agent = await once("ssh-add", ["-l"], 12_000, declaredAgent(host.output));
  const keys = agent.code === 0;
  diagnostics.push({
    ok: keys,
    step: "agent",
    title: "The SSH agent answers",
    detail: keys
      ? `${agent.output.trim().split("\n").length} key(s) available`
      : "no key loaded",
    fix: "Load your key — \"ssh-add ~/.ssh/your-key\" — or unlock the keychain holding it.",
  });

  const auth = await once("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    ...target(),
    "true",
  ]);
  const authenticated = auth.code === 0;
  diagnostics.push({
    ok: authenticated,
    step: "authentication",
    title: "The server accepts the key",
    detail: authenticated
      ? "connection established"
      : "the signature failed — an authorisation may be pending",
    fix: `Run "ssh ${activeHost()} true" in a terminal: the first connection often asks for confirmation.`,
  });

  const master = await once("ssh", ["-O", "check", activeHost()], 6000);
  const multiplexed = master.code === 0;
  diagnostics.push({
    ok: multiplexed,
    step: "multiplexing",
    title: "The connection is reused",
    detail: multiplexed ? "master connection open" : "no master connection",
    fix: "Harmless: it will open on the first command.",
  });

  return {
    connected: declared && authenticated,
    host: activeHost(),
    diagnostics,
  };
}

/**
 * The install script, if there is one.
 *
 * It does not ship with the app: someone who has just installed it has no reason
 * to own it, and theirs is not necessarily named like ours. The server profile
 * names it; failing that, we look in the places the starter stack lands. Its
 * absence is not a failure — it simply closes the shortcut, and the wizard then
 * explains the configuration to do by hand.
 */
const INSTALLERS = [
  "pupitre/server/mac/setup-mac.sh",
  "Projects/pupitre/server/mac/setup-mac.sh",
  "projects/pupitre/server/mac/setup-mac.sh",
  "Developer/pupitre/server/mac/setup-mac.sh",
  "dev/pupitre/server/mac/setup-mac.sh",
  "src/pupitre/server/mac/setup-mac.sh",
  "code/pupitre/server/mac/setup-mac.sh",
];

async function findInstaller(): Promise<string | null> {
  const declared = profile().installer;
  const candidates = declared ? [declared] : INSTALLERS;
  for (const candidate of candidates) {
    const path = candidate.startsWith("/")
      ? candidate
      : `${process.env.HOME}/${candidate.replace(/^~\//, "")}`;
    const res = await once("test", ["-x", path], 3000);
    if (res.code === 0) {
      return path;
    }
  }
  return null;
}

export async function installerPresent(): Promise<boolean> {
  return (await findInstaller()) !== null;
}

export async function runInstaller(): Promise<{
  code: number;
  output: string;
}> {
  const script = await findInstaller();
  if (!script) {
    return { code: 127, output: "install script not found" };
  }
  return once("sh", ["-c", `"${script}"`], 180_000);
}

/** Follows a remote log. The process lives as long as the panel is open. */
export function followLog(
  project: string,
  onLine: (text: string) => void
): () => void {
  const proc = spawn("ssh", [
    ...target(),
    `tail -n 400 -f ${logPath(profile(), project)}`,
  ]);
  proc.stdout?.setEncoding("utf8");
  proc.stdout?.on("data", onLine);
  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", onLine);
  return () => proc.kill();
}

/**
 * Runs a remote command, feeding it one line on standard input.
 *
 * Neither the shared channel nor a command line: an argument would be readable
 * in `ps` — on both sides of the tunnel — and would stay in the history. This is
 * what carries secrets, and also registry rows, which contain whole commands.
 */
export function sendLine(
  cmd: string,
  line: string,
  timeoutMs = 20_000
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn("ssh", [...target(), `${cmd} 2>&1`]);
    let output = "";
    proc.stdout?.on("data", (d) => {
      output += d;
    });
    proc.stderr?.on("data", (d) => {
      output += d;
    });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ code: 124, output });
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, output });
    });
    proc.stdin?.end(`${line}\n`);
  });
}

/**
 * A script read by a remote shell, alongside the shared channel.
 *
 * The channel serialises what goes through it: a command that talks to the
 * network — a `git fetch` taking more than a second — would hold back the poll
 * that refreshes the interface. So what is slow leaves the channel, at the cost
 * of opening an ssh, which multiplexing keeps brief.
 *
 * The script goes through the standard input of an `sh`: neither quotes nor
 * newlines have to cross a quoting level, and the machine's login shell,
 * whatever it is, has nothing to interpret.
 */
export function runScript(
  script: string,
  timeoutMs = 60_000
): Promise<{ code: number; output: string }> {
  return sendLine("sh", script, timeoutMs);
}

export function sendSecret(
  key: string,
  value: string
): Promise<{ code: number; output: string }> {
  return sendLine(`${command()} secrets set ${key}`, value);
}
