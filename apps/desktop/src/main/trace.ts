import type { TraceEntry } from "@shared/trace";

/**
 * What the main process does while a server gets added and opened, written
 * where it can be read.
 *
 * Nothing is traced in a packaged build: `index.ts` turns tracing on when the
 * app isn't packaged, and `PUPITRE_TRACE=1` turns it on elsewhere. Lines go
 * out on the main process's own stdout — the terminal that launched
 * `bun run dev` — and to the window, which drops them into the devtools
 * console: both halves of the app get debugged in the same place.
 *
 * A value whose name smells like a secret is never written. This module
 * knows neither Electron nor the bridge: a unit test imports it without
 * turning anything on, and a disabled trace doesn't cost an extra call.
 */

export type { TraceEntry } from "@shared/trace";

export type TraceSink = (entry: TraceEntry) => void;

const SECRET = /password|passphrase|secret|token|credential|private/i;
const SECRET_IN_TEXT =
  /((?:bearer|password|passphrase|secret|token|credential)\w*["']?\s*[:= ]\s*["']?)[^\s"',;&]+/gi;
const REDACTED = "•••";
const VALUE_LIMIT = 200;
const PAD = 2;

let on = process.env.PUPITRE_TRACE === "1";
let sink: TraceSink | null = null;

export function enableTrace(value: boolean): void {
  on = value || process.env.PUPITRE_TRACE === "1";
}

export function tracesTo(destination: TraceSink | null): void {
  sink = destination;
}

export function tracing(): boolean {
  return on;
}

function readable(value: unknown): string {
  if (typeof value === "string") {
    return value.length > VALUE_LIMIT
      ? `${value.slice(0, VALUE_LIMIT)}…`
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => readable(item)).join(" ");
  }

  return String(value);
}

/** A value named like a secret goes, and so does what follows a secret's name inside a sentence. */
export function scrubbed(
  detail: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(detail)) {
    if (SECRET.test(name)) {
      clean[name] = REDACTED;
    } else {
      clean[name] =
        typeof value === "string"
          ? value.replace(SECRET_IN_TEXT, `$1${REDACTED}`)
          : value;
    }
  }

  return clean;
}

function stamp(at: number): string {
  const date = new Date(at);
  const parts = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(PAD, "0"))
    .join(":");

  return `${parts}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function traceLine(entry: TraceEntry): string {
  const detail = Object.entries(entry.detail ?? {})
    .map(([name, value]) => `${name}=${readable(value)}`)
    .join(" ");

  return `[pupitre ${stamp(entry.at)}] ${entry.scope} ${entry.event}${detail ? ` ${detail}` : ""}`;
}

export function trace(
  scope: string,
  event: string,
  detail?: Record<string, unknown>
): void {
  if (!on) {
    return;
  }

  const entry: TraceEntry = {
    at: Date.now(),
    event,
    scope,
    ...(detail ? { detail: scrubbed(detail) } : {}),
  };

  console.debug(traceLine(entry));
  sink?.(entry);
}
