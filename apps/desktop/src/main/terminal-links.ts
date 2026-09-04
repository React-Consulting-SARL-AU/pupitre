// A machine can print any address; only these hosts ever become a button.
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

/** A sequence opens with a control character, so a space there ends the match. */
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

/** The last one, not the first: a reprinted address is the live one. */
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

/** The opening address carries a `code=true` of its own, which is not an answer. */
const SHORTEST_CODE = 8;

export function authorizationCode(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    const fragment = new URLSearchParams(parsed.hash.slice(1));
    const found = parsed.searchParams.get("code") ?? fragment.get("code");

    return found && found.length >= SHORTEST_CODE ? found : null;
  } catch {
    return null;
  }
}
