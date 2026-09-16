import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { argument } from "./ssh-config";

/**
 * The one line the app may write in the system's own SSH file, on request.
 *
 * `~/.ssh/config` is what `ssh`, the editors and the coding agents read; the
 * app's file is what the app reads. An `Include` of the second at the top of
 * the first is what makes every server of the app answer to its name
 * everywhere, with the app's key and the app's pinned host key, and it is the
 * whole of what the app writes there: one line, asked for, taken back the same
 * way, and never moved when the reader edits around it. It goes first because
 * `ssh` keeps the first value it meets, and an `Include` below a `Host *` would
 * inherit that block instead of the reader's intent.
 */

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const INCLUDE = /^\s*Include\s+(.+?)\s*$/i;

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

export function includeLine(appConfigPath: string): string {
  return `Include ${argument(appConfigPath)}`;
}

function includes(line: string, appConfigPath: string): boolean {
  const found = INCLUDE.exec(line);

  return found !== null && unquote(found[1] as string) === appConfigPath;
}

export function isShared(content: string, appConfigPath: string): boolean {
  return content.split("\n").some((line) => includes(line, appConfigPath));
}

/** The content with the line at its top, or as it was when it already carries it. */
export function withInclude(content: string, appConfigPath: string): string {
  if (isShared(content, appConfigPath)) {
    return content;
  }

  const rest = content.length === 0 || content.startsWith("\n") ? "" : "\n";

  return `${includeLine(appConfigPath)}\n${rest}${content}`;
}

/** The content without the line, wherever the reader had moved it, and without the blank it left at the top. */
export function withoutInclude(content: string, appConfigPath: string): string {
  const kept = content
    .split("\n")
    .filter((line) => !includes(line, appConfigPath))
    .join("\n");

  return kept.startsWith("\n") && !content.startsWith("\n")
    ? kept.slice(1)
    : kept;
}

function readOrEmpty(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function sharedAt(
  userConfigPath: string,
  appConfigPath: string
): boolean {
  return isShared(readOrEmpty(userConfigPath), appConfigPath);
}

/**
 * The file rewritten with or without the line, in the modes ssh insists on.
 *
 * A file that has to be created is created closed; one that exists keeps the
 * modes its owner gave it, since ssh already accepted them.
 */
export function shareAt(
  userConfigPath: string,
  appConfigPath: string,
  shared: boolean
): boolean {
  const before = readOrEmpty(userConfigPath);
  const after = shared
    ? withInclude(before, appConfigPath)
    : withoutInclude(before, appConfigPath);

  if (after !== before) {
    const fresh = !existsSync(userConfigPath);

    mkdirSync(dirname(userConfigPath), { mode: DIR_MODE, recursive: true });
    writeFileSync(userConfigPath, after, { mode: FILE_MODE });

    if (fresh) {
      chmodSync(userConfigPath, FILE_MODE);
    }
  }

  return sharedAt(userConfigPath, appConfigPath);
}
