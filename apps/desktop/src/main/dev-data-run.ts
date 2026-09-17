import { join } from "node:path";
import { isLocalPlatform } from "./platform-client";

/**
 * Where a development build keeps what it knows.
 *
 * The packaged app on the same computer talks to the platform, this build to
 * the console on this machine: an account, a server or a token of one means
 * nothing to the other, so they never share a folder — nor the single-instance
 * lock and the keychain entry that follow the name. A build pointed at a hosted
 * platform gets a folder named after it for the same reason: its token opens
 * nothing on the local console, and the two sessions may run side by side. The
 * harness names its own folder on the command line and is left alone.
 */
export const DEVELOPMENT_NAME = "Pupitre Dev";

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
