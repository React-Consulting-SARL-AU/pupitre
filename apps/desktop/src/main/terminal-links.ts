// A machine can print any address; only these hosts, or a flow that comes back to the machine, ever become a button.
const LOGIN_HOSTS = [
  "claude.ai",
  "claude.com",
  "anthropic.com",
  "openai.com",
  "chatgpt.com",
  "nousresearch.com",
  "neon.tech",
  "github.com",
];

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const ADDRESS = /https:\/\/[^\s"'<>`)\]]{4,2048}/g;

const TRAILING = /[.,;:!?]+$/;

const FIRST_PRINTABLE = 32;
const DELETE = 127;

export interface LoginAddress {
  url: string;
  host: string;
}

/** A sequence opens with a control character, so a space there ends the match. */
function printable(text: string): string {
  let clean = "";

  for (const char of text) {
    const code = char.charCodeAt(0);

    clean += code < FIRST_PRINTABLE || code === DELETE ? " " : char;
  }

  return clean;
}

function knownHost(host: string): boolean {
  return LOGIN_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
}

/**
 * The port a sign-in comes back to on the machine, when the flow ends there.
 *
 * A CLI that listens on its own loopback for the browser's return says so in
 * the `redirect_uri` of the address it prints. That port is on the server, and
 * the browser is on this computer: someone has to carry it across.
 */
export function loopbackRedirect(raw: string): number | null {
  try {
    const redirect = new URL(raw).searchParams.get("redirect_uri");

    if (!redirect) {
      return null;
    }

    const target = new URL(redirect);
    const port = Number(target.port);

    return LOOPBACK_HOSTS.includes(target.hostname) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function loginOf(raw: string): LoginAddress | null {
  try {
    const parsed = new URL(raw.replace(TRAILING, ""));
    const host = parsed.hostname;
    const login =
      knownHost(host) || loopbackRedirect(parsed.toString()) !== null;

    return login ? { host, url: parsed.toString() } : null;
  } catch {
    return null;
  }
}

/**
 * The last one, not the first: a reprinted address is the live one. The text
 * of a hyperlink follows its address and may be cut by a line break, so a
 * fragment of the one just found, or of the one already known, is not new.
 */
export function loginAddress(
  text: string,
  known: LoginAddress | null = null
): LoginAddress | null {
  let found = known;

  for (const match of printable(text).matchAll(ADDRESS)) {
    const address = loginOf(match[0]);

    if (address && !found?.url.startsWith(address.url)) {
      found = address;
    }
  }

  return found;
}
