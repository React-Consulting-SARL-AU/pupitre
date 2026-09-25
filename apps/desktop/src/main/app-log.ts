import {
  appendFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { scrubbed } from "./trace";

const FILE = "main.log";
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const MAX_BYTES = 512 * 1024;
const KEPT = 3;
const STACK_LINES = 12;

export interface AppLog {
  path: string;
  failure: (event: string, failure: unknown) => void;
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function turnOver(dir: string, kept: number): void {
  rmSync(join(dir, `main.${kept}.log`), { force: true });

  for (let index = kept - 1; index >= 1; index -= 1) {
    try {
      renameSync(
        join(dir, `main.${index}.log`),
        join(dir, `main.${index + 1}.log`)
      );
    } catch {
      // That generation was never written.
    }
  }

  renameSync(join(dir, FILE), join(dir, "main.1.log"));
}

function described(failure: unknown): Record<string, unknown> {
  if (!(failure instanceof Error)) {
    return { reason: String(failure) };
  }

  const stack = failure.stack?.split("\n").slice(1, STACK_LINES).join(" | ");

  return { reason: failure.message, ...(stack ? { stack: stack.trim() } : {}) };
}

/** Unlike the trace, stays on in a packaged build: failures only, scrubbed like trace lines. */
export function appLog({
  dir,
  maxBytes = MAX_BYTES,
  kept = KEPT,
  now = Date.now,
}: {
  dir: string;
  maxBytes?: number;
  kept?: number;
  now?: () => number;
}): AppLog {
  const path = join(dir, FILE);

  return {
    failure(event, failure) {
      const line = `${new Date(now()).toISOString()} ${event} ${JSON.stringify(
        scrubbed(described(failure))
      )}\n`;

      try {
        mkdirSync(dir, { mode: DIR_MODE, recursive: true });

        if (sizeOf(path) + line.length > maxBytes && sizeOf(path) > 0) {
          turnOver(dir, kept);
        }

        appendFileSync(path, line, { mode: FILE_MODE });
      } catch {
        // A failure handler must never throw because the disk refused the log.
      }
    },
    path,
  };
}
