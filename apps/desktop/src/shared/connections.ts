import type { ConnectionKind } from "@pupitre/shared/catalog";

export type { ConnectionKind } from "@pupitre/shared/catalog";

export interface ConnectionAccount {
  id: string;
  name: string;
}

export type ConnectionState =
  | { status: "absent" }
  | {
      status: "connected";
      /** Null for a provider the laptop cannot ask, such as a 1Password service account token. */
      account: ConnectionAccount | null;
      sealed: boolean;
    };

export type ConnectionsState = Record<ConnectionKind, ConnectionState>;

export type ConnectionCheck =
  | { status: "answered"; account: ConnectionAccount }
  | { status: "unaskable" };

/** A token opening several accounts is not connected until the client picks one, never the first listed. */
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
  "backup",
] as const satisfies readonly ConnectionKind[];

export const NO_CONNECTIONS: ConnectionsState = {
  "1password": { status: "absent" },
  backup: { status: "absent" },
  cloudflare: { status: "absent" },
  github: { status: "absent" },
  neon: { status: "absent" },
  stripe: { status: "absent" },
  supabase: { status: "absent" },
  vercel: { status: "absent" },
  wrangler: { status: "absent" },
};
