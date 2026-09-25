import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { argument } from "./ssh-config";

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

/** At the top: `ssh` keeps the first value it meets, and below a `Host *` the include would inherit it. */
export function withInclude(content: string, appConfigPath: string): string {
  if (isShared(content, appConfigPath)) {
    return content;
  }

  const rest = content.length === 0 || content.startsWith("\n") ? "" : "\n";

  return `${includeLine(appConfigPath)}\n${rest}${content}`;
}

/** Removes the line wherever the reader moved it. */
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

/** A new file is created closed; an existing one keeps the modes its owner gave, which ssh already accepts. */
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
