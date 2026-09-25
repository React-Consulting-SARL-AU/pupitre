import { arch, platform } from "node:process";
import { type HelpLink, isHelpLink } from "@shared/help";
import { app, ipcMain } from "electron";
import { openOutside } from "./foreground";
import { helpUrl } from "./help-links";

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
  ipcMain.handle("help:open", (_e, link: unknown, language: unknown) => {
    if (isHelpLink(link)) {
      openHelp(link, typeof language === "string" ? language : app.getLocale());
    }
  });
}
