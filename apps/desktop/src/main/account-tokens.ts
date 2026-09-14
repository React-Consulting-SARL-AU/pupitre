import type { AgentResponse } from "@shared/agent";
import type {
  ConnectionAccount,
  ConnectionCheck,
  ConnectionKind,
} from "@shared/connections";
import { verifyToken as verifyCloudflare } from "./cloudflare-api";
import { refuseWith } from "./refusal";

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

const VERCEL = "https://api.vercel.com/v2/user";

const SUPABASE = "https://api.supabase.com/v1/profile";

const STRIPE = "https://api.stripe.com/v1/account";

/** A provider that has not answered by then is not going to: the field is owed a refusal. */
const CALL_MS = 20_000;

/**
 * The provider's own message, never the token, and never a stack. A failure
 * whose cause is known names its own refusal, so the screen can say what to
 * add rather than that something was refused.
 */
export class TokenError extends Error {
  readonly refusal: string | null;

  constructor(message: string, refusal: string | null = null) {
    super(message);
    this.name = "TokenError";
    this.refusal = refusal;
  }
}

/** A token refused, worded by its cause when the cause is known, by the provider otherwise. */
export function tokenRefusal(
  kind: ConnectionKind,
  failure: unknown,
  fallback: string
): AgentResponse<never> {
  const known = failure instanceof TokenError ? failure.refusal : null;

  return refuseWith("bad_request", known ?? fallback, {
    kind,
    reason: failure instanceof Error ? failure.message : String(failure),
  });
}

async function read(
  url: string,
  token: string,
  fetcher: typeof fetch
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(CALL_MS),
  });

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!(response.ok && body)) {
    const nested = body?.error as Record<string, unknown> | undefined;
    const said = body?.message ?? nested?.message;

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

/** Vercel wraps the user; the username is what the CLI prints, the email what the client recognises. */
async function vercel(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const body = await read(VERCEL, token, fetcher);
  const user = (body.user ?? {}) as Record<string, unknown>;
  const id = text(user.id);

  if (!id) {
    throw new TokenError("no user");
  }

  const named = [text(user.username), text(user.email)].find(Boolean);

  return { id, name: named ?? id };
}

async function supabase(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const body = await read(SUPABASE, token, fetcher);
  const id = text(body.gotrue_id);

  if (!id) {
    throw new TokenError("no profile");
  }

  const named = [text(body.username), text(body.primary_email)].find(Boolean);

  return { id, name: named ?? id };
}

/** A Stripe key opens one account, named as its dashboard shows it. */
async function stripe(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const body = await read(STRIPE, token, fetcher);
  const id = text(body.id);

  if (!id) {
    throw new TokenError("no account");
  }

  const settings = (body.settings ?? {}) as Record<string, unknown>;
  const dashboard = (settings.dashboard ?? {}) as Record<string, unknown>;
  const profile = (body.business_profile ?? {}) as Record<string, unknown>;
  const named = [text(dashboard.display_name), text(profile.name)].find(
    Boolean
  );

  return { id, name: named ?? id };
}

/** One Cloudflare token may open several accounts; all of them come back, for the client to pick from. */
async function cloudflare(
  token: string,
  fetcher: typeof fetch
): Promise<ConnectionAccount[]> {
  const accounts = await verifyCloudflare(token, fetcher);

  // A valid token lists no account unless it may read account settings.
  if (accounts.length === 0) {
    throw new TokenError(
      "no account",
      "refusal.connection.cloudflare.unlisted"
    );
  }

  return accounts.map((one) => ({ id: one.id, name: one.name || one.id }));
}

/**
 * Reads what a token opens, or returns null for a provider with nothing to ask.
 * A refusal throws: a token that does not work is caught here, not on the
 * machine, and never written to the keychain.
 */
export async function accountsOfToken(
  kind: ConnectionKind,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<ConnectionAccount[] | null> {
  switch (kind) {
    case "cloudflare":
    case "wrangler":
      return cloudflare(token, fetcher);
    case "github":
      return [await github(token, fetcher)];
    case "neon":
      return [await neon(token, fetcher)];
    case "vercel":
      return [await vercel(token, fetcher)];
    case "supabase":
      return [await supabase(token, fetcher)];
    case "stripe":
      return [await stripe(token, fetcher)];
    default:
      return null;
  }
}

/**
 * The account the app acts on among those a token opens: the one the client
 * named, or the only one there is. Several and no name is a choice still owed.
 */
export function chosenAccount(
  accounts: readonly ConnectionAccount[],
  wanted: string | null
): ConnectionAccount | null {
  if (wanted !== null) {
    return accounts.find((one) => one.id === wanted) ?? null;
  }

  return accounts.length === 1 ? (accounts[0] ?? null) : null;
}

/**
 * A held token, weighed again, on the account it was connected for.
 *
 * A token revoked on the provider's side says nothing until an install fails
 * on it; asking from the settings is how a reader learns it first. The refusal
 * carries the provider's own words, never the token. A token that still works
 * but no longer opens the account it was connected for is refused too: the
 * zones, the tunnel and the deployments the app reads are that account's.
 */
export async function checkToken(
  kind: ConnectionKind,
  token: string,
  fetcher: typeof fetch = fetch,
  held: string | null = null
): Promise<AgentResponse<ConnectionCheck>> {
  let accounts: ConnectionAccount[] | null;

  try {
    accounts = await accountsOfToken(kind, token, fetcher);
  } catch (failure) {
    return tokenRefusal(kind, failure, "refusal.connection.revoked");
  }

  if (!accounts) {
    return { ok: true, result: { status: "unaskable" } };
  }

  const account = chosenAccount(accounts, held) ?? accounts[0];

  if (!account || (held !== null && account.id !== held)) {
    return refuseWith("bad_request", "refusal.connection.account.gone", {
      account: held ?? "",
      kind,
    });
  }

  return { ok: true, result: { account, status: "answered" } };
}
