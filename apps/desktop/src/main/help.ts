import { arch, platform } from "node:process";
import { type HelpLink, isHelpLink } from "@shared/help";
import { app } from "electron";
import { openOutside } from "./foreground";
import { helpUrl } from "./help-links";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";

export function openHelp(link: HelpLink, language: string): void {
  openOutside(
    helpUrl(link, {
      arch,
      language,
      platform,
      system: process.getSystemVersion(),
      version: app.getVersion(),
    })
  );
}

export function registerHelp(): void {
  handle("help:open", shape(isHelpLink, isString), (_e, link, language) =>
    openHelp(link, language)
  );
}
