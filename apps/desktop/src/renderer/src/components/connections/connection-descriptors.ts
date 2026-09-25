import type { ConnectionKind } from "@shared/connections";
import type { DictionaryKey } from "../../i18n/en";

export interface ConnectionDescriptor {
  kind: ConnectionKind;
  /** The module id whose logo stands for this account. */
  logo: string;
  title: DictionaryKey;
  intro?: DictionaryKey;
  label: DictionaryKey;
  help: DictionaryKey;
  hint: DictionaryKey;
  url: string;
  /** False when the provider cannot be asked who the token belongs to. */
  named: boolean;
}

export const CONNECTIONS: readonly ConnectionDescriptor[] = [
  {
    intro: "connections.cloudflare.intro",
    kind: "cloudflare",
    logo: "exposure.cloudflare",
    named: true,
    title: "connections.cloudflare.title",
    help: "connections.cloudflare.tokenHelp",
    hint: "connections.cloudflare.tokenHint",
    label: "connections.cloudflare.tokenLabel",
    url: "https://dash.cloudflare.com/profile/api-tokens",
  },
  {
    intro: "connections.wrangler.intro",
    kind: "wrangler",
    logo: "tool.wrangler",
    named: true,
    title: "connections.wrangler.title",
    help: "connections.wrangler.tokenHelp",
    hint: "connections.wrangler.tokenHint",
    label: "connections.wrangler.tokenLabel",
    url: "https://dash.cloudflare.com/profile/api-tokens",
  },
  {
    intro: "connections.github.intro",
    kind: "github",
    logo: "tool.github",
    named: true,
    title: "connections.github.title",
    help: "connections.github.tokenHelp",
    hint: "connections.github.tokenHint",
    label: "connections.github.tokenLabel",
    url: "https://github.com/settings/personal-access-tokens/new",
  },
  {
    intro: "connections.1password.intro",
    kind: "1password",
    logo: "tool.1password",
    named: false,
    title: "connections.1password.title",
    help: "connections.1password.tokenHelp",
    hint: "connections.1password.tokenHint",
    label: "connections.1password.tokenLabel",
    url: "https://developer.1password.com/docs/service-accounts/get-started",
  },
  {
    kind: "neon",
    logo: "tool.neon",
    named: true,
    title: "connections.neon.title",
    help: "connections.neon.tokenHelp",
    hint: "connections.neon.tokenHint",
    label: "connections.neon.tokenLabel",
    url: "https://console.neon.tech/app/settings/api-keys",
  },
  {
    kind: "vercel",
    logo: "tool.vercel",
    named: true,
    title: "connections.vercel.title",
    help: "connections.vercel.tokenHelp",
    hint: "connections.vercel.tokenHint",
    label: "connections.vercel.tokenLabel",
    url: "https://vercel.com/account/settings/tokens",
  },
  {
    kind: "supabase",
    logo: "tool.supabase",
    named: true,
    title: "connections.supabase.title",
    help: "connections.supabase.tokenHelp",
    hint: "connections.supabase.tokenHint",
    label: "connections.supabase.tokenLabel",
    url: "https://supabase.com/dashboard/account/tokens",
  },
  {
    kind: "stripe",
    logo: "tool.stripe",
    named: true,
    title: "connections.stripe.title",
    help: "connections.stripe.tokenHelp",
    hint: "connections.stripe.tokenHint",
    label: "connections.stripe.tokenLabel",
    url: "https://dashboard.stripe.com/apikeys",
  },
  {
    intro: "connections.backup.intro",
    kind: "backup",
    logo: "core.backup",
    named: false,
    title: "connections.backup.title",
    help: "connections.backup.tokenHelp",
    hint: "connections.backup.tokenHint",
    label: "connections.backup.tokenLabel",
    url: "https://developers.cloudflare.com/r2/api/tokens/",
  },
];

export function descriptorOf(kind: string): ConnectionDescriptor | null {
  return CONNECTIONS.find((one) => one.kind === kind) ?? null;
}
