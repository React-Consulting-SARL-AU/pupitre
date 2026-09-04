import { spawn } from "node:child_process";
import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import { agentClient } from "./agent";
import { byId, target } from "./servers";

/**
 * The three sources of terminal completion: the agent, the shell, the disk.
 *
 * The grammar is a command of the protocol, so it comes back typed and the app
 * holds no list of its own. The history and the folder listings are not: they
 * are two reads of the machine's own files, and they travel on a plain `ssh`
 * rather than on the protocol channel, which serialises its requests and must
 * not wait behind a `tail`.
 */

const READ_MS = 10_000;

const HISTORY_LINES = 800;

const ZSH_PREFIX = /^: \d+:\d+;/;

const DIR_OK = /^\/[\w.\-/+@%:,=]{0,240}$/;

const TOKEN_OK = /^[\w.\-/~+@%:,=]{0,200}$/;

const PATHS_KEPT = 60;

/**
 * A script read by a remote shell, outside the protocol channel.
 *
 * The script goes through the standard input of an `sh`: neither quotes nor
 * newlines have to cross a quoting level, and the machine's login shell,
 * whatever it is, has nothing to interpret.
 */
function readRemote(script: string): Promise<string> {
  return new Promise((resolve) => {
    const args = target();

    if (args.length === 0) {
      resolve("");

      return;
    }

    const proc = spawn("ssh", ["-o", "BatchMode=yes", ...args, "sh"]);
    let output = "";

    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      output += chunk;
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(output);
    }, READ_MS);

    proc.on("close", () => {
      clearTimeout(timer);
      resolve(output);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });

    proc.stdin?.end(`${script}\n`);
  });
}

/**
 * The grammar of the agent's commands.
 *
 * A server that refuses the command simply has no grammar source, and that is
 * all: history and paths do not depend on it.
 */
export async function catalog(
  serverId: unknown
): Promise<CompletionsResult | null> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return null;
  }

  const answer = await agentClient.request(serverId, "completions");

  return answer.ok ? answer.result : null;
}

/**
 * The remote shell's history, newest first, without duplicates.
 *
 * We read the file rather than query a shell: the protocol channel is not
 * interactive and has no history. Zsh's extended format prefixes each entry
 * with a timestamp; a multi-line command is recognised by its trailing
 * backslash, and we skip it — a completion never suggests more than one line.
 */
export async function history(): Promise<string[]> {
  const raw = await readRemote(
    `tail -n ${HISTORY_LINES} "$HOME/.zsh_history" 2>/dev/null || tail -n ${HISTORY_LINES} "$HOME/.bash_history" 2>/dev/null`
  );

  const seen = new Set<string>();
  const entries: string[] = [];
  const lines = raw.split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const continuation = i > 0 && lines[i - 1].endsWith("\\");
    const entry = line.replace(ZSH_PREFIX, "").trim();

    if (!entry || line.endsWith("\\") || continuation || seen.has(entry)) {
      continue;
    }

    seen.add(entry);
    entries.push(entry);
  }

  return entries;
}

function listing(base: string): string {
  if (base.startsWith("~/")) {
    return `"$HOME"/'${base.slice(2)}'`;
  }

  return base.length > 0 ? `'${base}'` : ".";
}

/**
 * The entries of the remote folder that start with what was typed.
 *
 * The folder comes from the shell itself (OSC 7), the token from the terminal;
 * both end up in an `ls`, so both are bounded to path characters, with no quote
 * and no space. A path that does not pass has no completion, and nothing worse.
 */
export async function paths(dir: string, token: string): Promise<string[]> {
  if (!(DIR_OK.test(dir) && TOKEN_OK.test(token))) {
    return [];
  }

  const cut = token.lastIndexOf("/");
  const base = cut === -1 ? "" : token.slice(0, cut + 1);
  const prefix = cut === -1 ? token : token.slice(cut + 1);

  const output = await readRemote(
    `cd '${dir}' 2>/dev/null && ls -1pA -- ${listing(base)} 2>/dev/null | head -n 500`
  );

  const hidden = prefix.startsWith(".");

  return output
    .split("\n")
    .map((entry) => entry.trim())
    .filter(
      (entry) =>
        entry.length > 0 &&
        entry.startsWith(prefix) &&
        (hidden || !entry.startsWith(".")) &&
        !entry.includes("'")
    )
    .map((entry) => base + entry)
    .slice(0, PATHS_KEPT);
}
