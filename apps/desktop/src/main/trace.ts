import type { TraceEntry } from "@shared/trace";

export type { TraceEntry } from "@shared/trace";

export type TraceSink = (entry: TraceEntry) => void;

const SECRET = /password|passphrase|secret|token|credential|private/i;
const SECRET_IN_TEXT =
  /((?:bearer|password|passphrase|secret|token|credential)\w*["']?\s*[:= ]\s*["']?)[^\s"',;&]+/gi;
const REDACTED = "•••";
const VALUE_LIMIT = 200;
const PAD = 2;

// Off by default, so a packaged build traces nothing unless PUPITRE_TRACE=1.
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
