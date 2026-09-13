import type { ConnectionKind } from "@pupitre/shared/catalog";

export type { ConnectionKind } from "@pupitre/shared/catalog";

/**
 * The third-party accounts the app holds for the client, once for every server.
 *
 * A connection is not a module: it is what a module needs before it can be
 * installed, and the manifest says so. A token that is the same on every
 * machine — a GitHub token, a Neon key — belongs to the account rather than to
 * a server, and the app fills the module's managed field with it at install
 * time. The token itself lives in the system keychain and never comes back
 * across the bridge; what the window learns is that an account is connected,
 * and under what name when the provider can be asked.
 */

/** What the token opens, read from the provider rather than typed by the client. */
export interface ConnectionAccount {
  id: string;
  name: string;
}

export type ConnectionState =
  | { status: "absent" }
  | {
      status: "connected";
      /**
       * Null for a provider the laptop cannot ask — a 1Password service account
       * token answers no call from here. The token is held, nothing names it,
       * and the screen says exactly that rather than inventing a label.
       */
      account: ConnectionAccount | null;
      sealed: boolean;
    };

export type ConnectionsState = Record<ConnectionKind, ConnectionState>;

/**
 * What asking the provider again says of a held token: the account it opens
 * today, or that this provider answers no call from here.
 */
export type ConnectionCheck =
  | { status: "answered"; account: ConnectionAccount }
  | { status: "unaskable" };

/**
 * What giving a token leads to. A token that opens several accounts is not
 * connected yet: the app acts on one — its zones, its tunnel, its deployments —
 * and which one is the client's to say, not the first the provider listed.
 */
export type ConnectionOutcome =
  | { status: "connected"; state: ConnectionsState }
  | { status: "choose"; accounts: ConnectionAccount[] };

export const CONNECTION_KINDS = [
  "cloudflare",
  "wrangler",
  "github",
  "1password",
  "neon",
  "vercel",
  "supabase",
  "stripe",
] as const satisfies readonly ConnectionKind[];

export const NO_CONNECTIONS: ConnectionsState = {
  "1password": { status: "absent" },
  cloudflare: { status: "absent" },
  github: { status: "absent" },
  neon: { status: "absent" },
  stripe: { status: "absent" },
  supabase: { status: "absent" },
  vercel: { status: "absent" },
  wrangler: { status: "absent" },
};
