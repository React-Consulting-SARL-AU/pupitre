import type { AgentResponse } from "@shared/agent";
import type {
  ConnectionAccount,
  ConnectionCheck,
  ConnectionKind,
  ConnectionSettings,
} from "@shared/connections";
import { verifyToken as verifyCloudflare } from "./cloudflare-api";
import { refuseWith } from "./refusal";

const GITHUB = "https://api.github.com/user";

const NEON = "https://console.neon.tech/api/v2/users/me";

const VERCEL = "https://api.vercel.com/v2/user";

const SUPABASE = "https://api.supabase.com/v1/profile";

const STRIPE = "https://api.stripe.com/v1/account";

const INFISICAL_LOGIN = "/api/v1/auth/universal-auth/login";

const CALL_MS = 20_000;

/** Carries the provider's own message, never the token nor a stack. */
export class TokenError extends Error {
  readonly refusal: string | null;

  constructor(message: string, refusal: string | null = null) {
    super(message);
    this.name = "TokenError";
    this.refusal = refusal;
  }
}

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

/** GitHub ids are numbers; the other providers use strings. */
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

function claimsOf(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split(".")[1] ?? "";

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** The token is the client secret; logging in is the only question a machine identity answers, and its access token names it. */
async function infisical(
  clientSecret: string,
  settings: ConnectionSettings,
  fetcher: typeof fetch
): Promise<ConnectionAccount> {
  const clientId = settings.client_id ?? "";
  const response = await fetcher(`${settings.domain}${INFISICAL_LOGIN}`, {
    body: JSON.stringify({ clientId, clientSecret }),
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(CALL_MS),
  });

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const accessToken = text(body?.accessToken);

  if (!(response.ok && accessToken)) {
    const said = text(body?.message);

    throw new TokenError(said || `HTTP ${String(response.status)}`);
  }

  const claims = claimsOf(accessToken);

  return {
    id: text(claims.identityId) || clientId,
    name: text(claims.identityName) || clientId,
  };
}

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

/** Null for a provider with nothing to ask, such as a 1Password service account token; `settings` are those the token was given with. */
export async function accountsOfToken(
  kind: ConnectionKind,
  token: string,
  fetcher: typeof fetch = fetch,
  settings: ConnectionSettings = {}
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
    case "infisical":
      return [await infisical(token, settings, fetcher)];
    default:
      return null;
  }
}

export function chosenAccount(
  accounts: readonly ConnectionAccount[],
  wanted: string | null
): ConnectionAccount | null {
  if (wanted !== null) {
    return accounts.find((one) => one.id === wanted) ?? null;
  }

  return accounts.length === 1 ? (accounts[0] ?? null) : null;
}

/** A working token that no longer opens its connected account is refused: the app reads that account's data. */
export async function checkToken(
  kind: ConnectionKind,
  token: string,
  fetcher: typeof fetch = fetch,
  held: string | null = null,
  settings: ConnectionSettings = {}
): Promise<AgentResponse<ConnectionCheck>> {
  let accounts: ConnectionAccount[] | null;

  try {
    accounts = await accountsOfToken(kind, token, fetcher, settings);
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
