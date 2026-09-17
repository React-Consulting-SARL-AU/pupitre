import { isAbsolute } from "node:path";

/**
 * The key files the reader pointed at, and no other.
 *
 * A path the renderer names for a key reaches `ssh -i` and a copy into the
 * app's folder: it has to be one the file picker handed out in this session,
 * exactly as a transfer's local path is. What was not picked is not a key.
 */

const designated = new Set<string>();

export function designateKeyFile(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0 || !isAbsolute(path)) {
    return null;
  }

  designated.add(path);

  return path;
}

export function designatedKeyFile(path: unknown): path is string {
  return typeof path === "string" && designated.has(path);
}
