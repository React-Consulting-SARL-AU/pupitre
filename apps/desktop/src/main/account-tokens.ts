import type { ConnectionAccount, ConnectionKind } from "@shared/connections";
import { verifyToken as verifyCloudflare } from "./cloudflare-api";

/**
 * What a token opens, asked of the provider the moment it is given.
 *
 * The bash stack this replaces checked a token at the eighth step, on the
 * machine, once the client had stopped watching. Here a token is weighed at the
 * fifth second, from the laptop, and what comes back is the account name the
 * client would otherwise have had to copy out of a dashboard.
 *
 * One provider cannot be asked: a 1Password service account token authenticates
 * the `op` CLI and answers no call from here. It is held unnamed rather than
 * labelled with a guess, and the server says at install whether it opens a
 * vault.
 */

const GITHUB = "https://api.github.com/user";

const NEON = "https://console.neon.tech/api/v2/users/me";

/** The provider's own message, never the token, and never a stack. */
export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

async function read(
  url: string,
  token: string,
  fetcher: typeof fetch
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!(response.ok && body)) {
    const said = body?.message;

    throw new TokenError(
      typeof said === "string" && said
        ? said
        : `HTTP ${String(response.status)}`
    );
  }

  return body;
}

/** GitHub numbers its accounts, Neon and Cloudflare name them with a string. */
function text(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value ? value : "";
}

async function github(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const body = await read(GITHUB, token, fetcher);
  const login = text(body.login);

  if (!login) {
    throw new TokenError("no login");
  }

  return { id: text(body.id) || login, name: login };
}

async function neon(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const body = await read(NEON, token, fetcher);
  const id = text(body.id);

  if (!id) {
    throw new TokenError("no user");
  }

  const named = [text(body.name), text(body.email)].find(Boolean);

  return { id, name: named ?? id };
}

async function cloudflare(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const accounts = await verifyCloudflare(token, fetcher);
  const account = accounts[0];

  if (!account) {
    throw new TokenError("no account");
  }

  return { id: account.id, name: account.name || account.id };
}

/**
 * Reads what a token opens, or returns null for a provider with nothing to ask.
 * A refusal throws: a token that does not work is caught here, not on the
 * machine, and never written to the keychain.
 */
export function accountOfToken(
  kind: ConnectionKind,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<ConnectionAccount | null> {
  switch (kind) {
    case "cloudflare":
      return cloudflare(token, fetcher);
    case "github":
      return github(token, fetcher);
    case "neon":
      return neon(token, fetcher);
    default:
      return Promise.resolve(null);
  }
}
