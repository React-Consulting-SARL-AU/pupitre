import { join } from "node:path";

/**
 * Where a development build keeps what it knows.
 *
 * The packaged app on the same computer talks to the platform, this build to
 * the console on this machine: an account, a server or a token of one means
 * nothing to the other, so they never share a folder — nor the single-instance
 * lock and the keychain entry that follow the name. The harness names its own
 * folder on the command line and is left alone.
 */
export const DEVELOPMENT_NAME = "Pupitre Dev";

export function developmentDataFolder(
  appData: string,
  packaged: boolean,
  harnessed: boolean
): string | null {
  return packaged || harnessed ? null : join(appData, DEVELOPMENT_NAME);
}
