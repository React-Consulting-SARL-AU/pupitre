import { ownPage, type PageRules } from "./navigation";
import { trace } from "./trace";

/**
 * A channel of the bridge, answered only to the app's own page and only for
 * arguments of the shape it takes.
 *
 * Both refusals reject the call rather than answer it: the page the app ships
 * never sends either, so what reaches them is a bug or someone else's frame,
 * and neither gets a phrase to show.
 */

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

/** Where the page the app ships is loaded from: set once, before the window opens. */
export function trustPage(rules: PageRules): void {
  page = rules;
}

/** The top frame of the app's own page, and nothing embedded in it or navigated elsewhere. */
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

/** An argument the handler reads field by field, or refuses in its own words. */
export function anything(_value: unknown): _value is unknown {
  return true;
}

/** The arguments one by one, each against its check; extra arguments are refused too. */
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

/** The listener `ipcMain.handle` takes, with both checks in front of `run`. */
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
