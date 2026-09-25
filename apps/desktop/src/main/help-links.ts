import { LEGAL_CONTACTS, PUPITRE_ORIGINS } from "@pupitre/shared/legal";
import type { HelpLink } from "@shared/help";
import { dialogTextIn } from "./dialogs";

export interface HelpFacts {
  language: string;
  version: string;
  platform: NodeJS.Platform;
  system: string;
  arch: string;
}

const SYSTEM_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Windows",
};

function sitePage(page: string, language: string): string {
  const prefix = language.startsWith("fr") ? "/fr" : "";

  return `${PUPITRE_ORIGINS.site}${prefix}/${page}`;
}

/** The support mail names the build and the system, so the first answer need not ask for them. */
function supportMail(facts: HelpFacts): string {
  const system = SYSTEM_NAMES[facts.platform] ?? facts.platform;
  const build = `Pupitre ${facts.version} · ${system} ${facts.system} · ${facts.arch}`;
  const query = new URLSearchParams({
    body: `\n\n—\n${build}`,
    subject: dialogTextIn(facts.language, "supportSubject"),
  });

  return `mailto:${LEGAL_CONTACTS.support}?${query.toString().replaceAll("+", "%20")}`;
}

export function helpUrl(link: HelpLink, facts: HelpFacts): string {
  switch (link) {
    case "docs":
      return sitePage("docs", facts.language);
    case "legal":
      return sitePage("legal", facts.language);
    default:
      return supportMail(facts);
  }
}
