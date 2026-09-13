// A machine can print any address; only these hosts, or a flow that comes back to the machine, ever become a button.
const LOGIN_HOSTS = [
  "claude.ai",
  "claude.com",
  "anthropic.com",
  "openai.com",
  "chatgpt.com",
  "nousresearch.com",
  "cursor.com",
  "opencode.ai",
  "neon.tech",
  "github.com",
];

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const ADDRESS = /https:\/\/[^\s"'<>`)\]]{4,2048}/g;

const TRAILING = /[.,;:!?]+$/;

export interface LoginAddress {
  url: string;
  host: string;
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

function margin(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * The rows of a screen, with a folded line read as one.
 *
 * An address longer than the screen is wide reaches the last column and goes
 * on at the left edge of the next row: the terminal wraps it there, and so
 * does an interface that lays its text out itself, at the margin of its box
 * rather than at the edge. Nothing on the screen says which rows belong
 * together, only that shape does.
 */
export function unwrap(lines: string[], cols: number): string[] {
  const rows: string[] = [];
  let open: string | null = null;
  let edge = 0;

  for (const line of lines) {
    const left = margin(line);

    if (open !== null && left === edge && line.length > left) {
      open += line.slice(left);
    } else {
      if (open !== null) {
        rows.push(open);
      }

      open = line;
      edge = left;
    }

    if (line.length + edge !== cols) {
      rows.push(open);
      open = null;
    }
  }

  if (open !== null) {
    rows.push(open);
  }

  return rows;
}

/**
 * The last one, not the first: a reprinted address is the live one. A row
 * painted before the rest of its address, or one the fold missed, is a
 * fragment of the one just found or of the one already known, not a new one.
 */
export function loginAddress(
  lines: string[],
  cols: number,
  known: LoginAddress | null = null
): LoginAddress | null {
  let found = known;

  for (const row of unwrap(lines, cols)) {
    for (const match of row.matchAll(ADDRESS)) {
      const address = loginOf(match[0]);

      if (address && !found?.url.startsWith(address.url)) {
        found = address;
      }
    }
  }

  return found;
}
