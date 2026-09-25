import { isAbsolute } from "node:path";

/** A renderer-named key reaches `ssh -i`, so only paths the file picker handed out this session count. */
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
