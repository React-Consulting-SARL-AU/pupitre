import { ownPage, type PageRules } from "./navigation";
import { trace } from "./trace";

// Refusals throw instead of answering: the shipped page never sends either, so one is a bug or a foreign frame.

type Check<T> = (value: unknown) => value is T;

type Checked<C extends readonly Check<unknown>[]> = {
  -readonly [K in keyof C]: C[K] extends Check<infer T> ? T : never;
};

export interface Frame {
  parent: unknown;
  url: string;
}

export interface Sender {
  senderFrame: Frame | null;
}

let page: PageRules | null = null;

/** Set once, before the window opens. */
export function trustPage(rules: PageRules): void {
  page = rules;
}

export function fromOwnPage(
  frame: Frame | null,
  rules: PageRules | null = page
): boolean {
  return Boolean(
    frame && frame.parent === null && rules && ownPage(frame.url, rules)
  );
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function optional<T>(
  check: Check<T>
): (value: unknown) => value is T | undefined {
  return (value): value is T | undefined => value === undefined || check(value);
}

/** For an argument the handler reads field by field, or refuses in its own words. */
export function anything(_value: unknown): _value is unknown {
  return true;
}

/** Extra arguments are refused too. */
export function shape<const C extends readonly Check<unknown>[]>(
  ...checks: C
): (args: unknown[]) => Checked<C> | null {
  return (args) =>
    args.length <= checks.length &&
    checks.every((check, index) => check(args[index]))
      ? (args as Checked<C>)
      : null;
}

export class IpcRefused extends Error {}

function refused(channel: string, why: string): IpcRefused {
  trace("ipc", "refused", { channel, why });

  return new IpcRefused(`${channel}: ${why}`);
}

export function guarded<E extends Sender, A extends unknown[], R>(
  channel: string,
  parse: (args: unknown[]) => A | null,
  run: (event: E, ...args: A) => R
): (event: E, ...raw: unknown[]) => R {
  return (event, ...raw) => {
    if (!fromOwnPage(event.senderFrame)) {
      throw refused(channel, "not the app's page");
    }

    const args = parse(raw);

    if (!args) {
      throw refused(channel, "arguments of another shape");
    }

    return run(event, ...args);
  };
}
