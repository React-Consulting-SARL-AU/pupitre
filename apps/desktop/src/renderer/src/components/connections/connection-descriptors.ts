import type { ConnectionKind } from "@shared/connections";
import type { DictionaryKey } from "../../i18n/en";

/**
 * What each account needs said, and where the client goes to get its token.
 *
 * The wording lives in the dictionary like every other phrase; this only names
 * which entry belongs to which provider, and the one page that issues a token.
 * A provider the laptop cannot ask carries `named: false`: the screen then says
 * the token is held rather than naming an account it never learnt.
 */
export interface ConnectionDescriptor {
  kind: ConnectionKind;
  /** The module whose brand this account wears, for the logo the row shows. */
  logo: string;
  title: DictionaryKey;
  intro: DictionaryKey;
  label: DictionaryKey;
  help: DictionaryKey;
  hint: DictionaryKey;
  url: string;
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
    intro: "connections.neon.intro",
    kind: "neon",
    logo: "tool.neon",
    named: true,
    title: "connections.neon.title",
    help: "connections.neon.tokenHelp",
    hint: "connections.neon.tokenHint",
    label: "connections.neon.tokenLabel",
    url: "https://console.neon.tech/app/settings/api-keys",
  },
];

export function descriptorOf(kind: string): ConnectionDescriptor | null {
  return CONNECTIONS.find((one) => one.kind === kind) ?? null;
}
