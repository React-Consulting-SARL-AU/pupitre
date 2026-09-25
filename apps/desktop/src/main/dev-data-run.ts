import { join } from "node:path";
import { isLocalPlatform } from "./platform-client";

/** Its own folder, lock and keychain entry per platform: an account or token of one means nothing to another. */
export const DEVELOPMENT_NAME = "Pupitre Dev";

/** A packaged app ignores `PUPITRE_E2E`, which would lift its single-instance lock and move its home folder. */
export function harnessOn(
  asked: string | undefined,
  packaged: () => boolean
): boolean {
  return asked === "1" && !packaged();
}

export function developmentDataFolder(
  appData: string,
  packaged: boolean,
  harnessed: boolean,
  platform: string
): string | null {
  if (packaged || harnessed) {
    return null;
  }

  const name = isLocalPlatform(platform)
    ? DEVELOPMENT_NAME
    : `${DEVELOPMENT_NAME} (${new URL(platform).host})`;

  return join(appData, name);
}
