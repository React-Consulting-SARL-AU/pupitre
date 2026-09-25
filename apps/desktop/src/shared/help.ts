export const HELP_LINKS = ["docs", "support", "legal"] as const;

export type HelpLink = (typeof HELP_LINKS)[number];

export function isHelpLink(value: unknown): value is HelpLink {
  return HELP_LINKS.includes(value as HelpLink);
}
