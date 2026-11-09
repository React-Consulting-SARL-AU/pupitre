// Functions of a platform name, not `process.platform` reads, so a Mac can test what Windows gets.

export type Platform = NodeJS.Platform;

export function current(): Platform {
  return process.platform;
}

/** Windows OpenSSH rejects `controlmaster` and with it the whole config file. */
export function multiplexes(platform: Platform): boolean {
  return platform !== "win32";
}

export interface WindowChrome {
  titleBarStyle: "hidden" | "hiddenInset";
  titleBarOverlay?: true;
}

/** `hiddenInset` means "no frame" outside macOS: Windows would have nothing to close the window by. */
export function windowChrome(platform: Platform): WindowChrome {
  return platform === "darwin"
    ? { titleBarStyle: "hiddenInset" }
    : { titleBarOverlay: true, titleBarStyle: "hidden" };
}
