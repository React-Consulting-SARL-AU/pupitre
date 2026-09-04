import { type ChildProcess, spawn } from "node:child_process";
import { statSync } from "node:fs";
import type { ConnectionState, Diagnostic } from "@shared/contract";
import { logPath } from "@shared/profile";
import { looksLikeHostKeyChange } from "./host-keys";
import { active, paths, profile } from "./servers";
import { alias, sshArgs } from "./ssh-config";

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

/**
 * The ssh arguments of the active server.
 *
 * A server of the app is reached through the app's own configuration file, by
 * the alias it holds there; a host taken from the system configuration is
 * reached by its name, and ssh reads the user's file as it always did.
 */
export function target(): string[] {
  const server = active();

  return server ? sshArgs(server, paths()) : [];
}

/** What to write when naming the server: the alias, never a bare address. */
export function activeHost(): string {
  const server = active();

  return server ? alias(server) : "";
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
function declaredAgent(
  expandedConfig: string
): Record<string, string> | undefined {
  const socket = expandedConfig.match(/^identityagent (.+)$/m)?.[1].trim();

  return socket && socket !== "none"
    ? { SSH_AUTH_SOCK: socket.replace(/^"|"$/g, "") }
    : undefined;
}

const NOTHING_YET: Diagnostic = {
  ok: false,
  step: "host",
  title: "No server yet",
  detail: "nothing to connect to",
  fix: "Add a server in the settings: an address, a port, an account, and a key the app generates for this computer.",
};

/** The private key the app made, and the mode SSH refuses to work without. */
function keyDiagnostic(keyPath: string): Diagnostic {
  try {
    const mode = statSync(keyPath).mode.toString(8).slice(-3);

    return {
      ok: mode === "600",
      step: "agent",
      title: "The key of this computer is in place",
      detail: `${keyPath} — ${mode}`,
      fix: `Restore its permissions: "chmod 600 ${keyPath}". SSH refuses a key readable by anyone else.`,
    };
  } catch {
    return {
      ok: false,
      step: "agent",
      title: "The key of this computer is in place",
      detail: `${keyPath} is missing`,
      fix: "Remove the server and add it again: the app will generate a new key and show you the line to paste.",
    };
  }
}

async function agentDiagnostic(expandedConfig: string): Promise<Diagnostic> {
  const agent = await once(
    "ssh-add",
    ["-l"],
    12_000,
    declaredAgent(expandedConfig)
  );
  const keys = agent.code === 0;

  return {
    ok: keys,
    step: "agent",
    title: "The SSH agent answers",
    detail: keys
      ? `${agent.output.trim().split("\n").length} key(s) available`
      : "no key loaded",
    fix: 'Load your key — "ssh-add ~/.ssh/your-key" — or unlock the keychain holding it.',
  };
}

/**
 * A refused connection says which refusal it is.
 *
 * A changed host key and a missing public key both come back as "denied", and
 * the two are repaired in opposite ways: one by installing a key, the other by
 * not connecting at all until the machine has been checked.
 */
function authDiagnostic(authenticated: boolean, output: string): Diagnostic {
  if (authenticated) {
    return {
      ok: true,
      step: "authentication",
      title: "The server accepts the key",
      detail: "connection established",
      fix: "",
    };
  }

  return looksLikeHostKeyChange(output)
    ? {
        ok: false,
        step: "authentication",
        title: "The host key of this server has changed",
        detail:
          "ssh refused: the machine no longer presents the key that was pinned",
        fix: "If you have just reinstalled this server, replace the pinned fingerprint from the servers screen. Otherwise do not connect.",
      }
    : {
        ok: false,
        step: "authentication",
        title: "The server accepts the key",
        detail:
          "the signature failed — the public key may not be installed yet",
        fix: "Paste the ssh-copy-id line from the servers screen on the machine, then try again.",
      };
}

/**
 * The four checks, in the order they get fixed.
 *
 * Each carries its own remedy: "it does not work" helps nobody, whereas "no key
 * in the agent" is solved in ten seconds. That is exactly the diagnosis that
 * costs the most when it is missing.
 *
 * Which key is checked depends on who owns the connection. A server of the app
 * has a key of its own, and what can go wrong is the file and its mode; a host
 * taken from the system configuration is opened by whatever agent that machine
 * uses, and the app has no business naming one.
 */
export async function diagnose(): Promise<ConnectionState> {
  const server = active();
  if (!server) {
    return { connected: false, host: "", diagnostics: [NOTHING_YET] };
  }

  const name = activeHost();
  const own = server.origin === "app";
  const file = own ? ["-F", paths().configPath] : [];
  const diagnostics: Diagnostic[] = [];

  const host = await once("ssh", [...file, "-G", name]);
  const declared = host.code === 0 && /^hostname \S+/m.test(host.output);
  diagnostics.push({
    ok: declared,
    step: "host",
    title: `Host ${name} is declared`,
    detail: declared
      ? (host.output.match(/^hostname (\S+)/m)?.[1] ?? name)
      : `no "Host ${name}" block`,
    fix: own
      ? "Remove the server and add it again: its block is missing from the app's own configuration."
      : `Add a "Host ${name}" block to ~/.ssh/config, or pick another server in the settings.`,
  });

  if (!declared) {
    return { connected: false, host: name, diagnostics };
  }

  diagnostics.push(
    own && server.keyPath
      ? keyDiagnostic(server.keyPath)
      : await agentDiagnostic(host.output)
  );

  const auth = await once("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    ...target(),
    "true",
  ]);
  const authenticated = auth.code === 0;
  diagnostics.push(authDiagnostic(authenticated, auth.output));

  const master = await once("ssh", [...file, "-O", "check", name], 6000);
  const multiplexed = master.code === 0;
  diagnostics.push({
    ok: multiplexed,
    step: "multiplexing",
    title: "The connection is reused",
    detail: multiplexed ? "master connection open" : "no master connection",
    fix: "Harmless: it will open on the first command.",
  });

  return { connected: declared && authenticated, host: name, diagnostics };
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
