/**
 * The login addresses an agent prints, and the code its provider hands back.
 *
 * Claude Code, Codex and Hermes all sign in the same way: they print an address
 * and wait for what comes back from it. Opening that address in the system
 * browser means leaving the app and carrying a code across two windows, so the
 * app opens it itself — and for that it has to recognise one in a stream that
 * is otherwise drawing an interface.
 *
 * Only the hosts of the providers below are ever opened. A machine can print
 * whatever it likes; what the app turns into a button is a short, closed list.
 */

const LOGIN_HOSTS = [
  "claude.ai",
  "anthropic.com",
  "openai.com",
  "chatgpt.com",
  "nousresearch.com",
];

const ADDRESS = /https:\/\/[^\s"'<>`)\]]{4,600}/g;

const TRAILING = /[.,;:!?]+$/;

const FIRST_PRINTABLE = 32;
const DELETE = 127;

/**
 * The stream without its escape sequences.
 *
 * Every control character becomes a space, which is enough: a sequence always
 * opens with one, so an address followed by a colour reset ends at the space
 * that replaced its escape rather than swallowing `[0m`.
 */
function printable(text: string): string {
  let clean = "";

  for (const char of text) {
    const code = char.charCodeAt(0);

    clean += code < FIRST_PRINTABLE || code === DELETE ? " " : char;
  }

  return clean;
}

function fromKnownHost(raw: string): { url: string; host: string } | null {
  try {
    const parsed = new URL(raw.replace(TRAILING, ""));
    const host = parsed.hostname;
    const known = LOGIN_HOSTS.some(
      (name) => host === name || host.endsWith(`.${name}`)
    );

    return known ? { host, url: parsed.toString() } : null;
  } catch {
    return null;
  }
}

/**
 * The last login address of a chunk of output, if it carries one.
 *
 * The last rather than the first: an agent that reprints its address after a
 * failed attempt means the newest one is the live one.
 */
export function loginAddress(
  text: string
): { url: string; host: string } | null {
  let found: { url: string; host: string } | null = null;

  for (const match of printable(text).matchAll(ADDRESS)) {
    const address = fromKnownHost(match[0]);

    if (address) {
      found = address;
    }
  }

  return found;
}

/**
 * The code a provider sends back at the end of the round trip.
 *
 * It travels in the address of the page the browser is sent to, whether that
 * page can be reached from this computer or not: the app reads the address and
 * stops there, so a redirection to a port of the server is never opened.
 */
export function authorizationCode(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    const query = parsed.searchParams.get("code");

    if (query) {
      return query;
    }

    const fragment = new URLSearchParams(parsed.hash.slice(1));

    return fragment.get("code");
  } catch {
    return null;
  }
}
