import type { Catalog } from "@shared/contract";
import { channel, command } from "./ssh";

/**
 * The grammar of the admin command, asked of the server.
 *
 * A server that cannot return it simply has no grammar completion source, and
 * that is all: history and paths do not depend on it.
 */
export async function catalog(): Promise<Catalog | null> {
  try {
    const raw = await channel.run(
      `${command()} completions 2>/dev/null`,
      10_000
    );
    const start = raw.indexOf("{");
    if (start === -1) {
      return null;
    }
    const read = JSON.parse(raw.slice(start)) as Partial<Catalog>;
    if (!Array.isArray(read.sub)) {
      return null;
    }
    return { command: command(), sub: read.sub };
  } catch {
    return null;
  }
}

const ZSH_PREFIX = /^: \d+:\d+;/;

/**
 * The remote shell's history, newest first, without duplicates.
 *
 * We read the file rather than query a shell: the shared channel is not
 * interactive and has no history. Zsh's extended format prefixes each entry with
 * a timestamp; a multi-line command is recognised by its trailing backslash, and
 * we skip it — a completion never suggests more than one line.
 */
export async function history(): Promise<string[]> {
  let raw = "";
  try {
    raw = await channel.run(
      'tail -n 800 "$HOME/.zsh_history" 2>/dev/null || tail -n 800 "$HOME/.bash_history" 2>/dev/null',
      10_000
    );
  } catch {
    return [];
  }

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

const DIR_OK = /^\/[\w.\-/+@%:,=]{0,240}$/;
const TOKEN_OK = /^[\w.\-/~+@%:,=]{0,200}$/;

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
  let target = ".";
  if (base.startsWith("~/")) {
    target = `"$HOME"/'${base.slice(2)}'`;
  } else if (base.length > 0) {
    target = `'${base}'`;
  }

  let output = "";
  try {
    output = await channel.run(
      `cd '${dir}' 2>/dev/null && ls -1pA -- ${target} 2>/dev/null | head -n 500`,
      10_000
    );
  } catch {
    return [];
  }

  const hidden = prefix.startsWith(".");

  return output
    .split("\n")
    .map((e) => e.trim())
    .filter(
      (e) =>
        e.length > 0 &&
        e.startsWith(prefix) &&
        (hidden || !e.startsWith(".")) &&
        !e.includes("'")
    )
    .map((e) => base + e)
    .slice(0, 60);
}
