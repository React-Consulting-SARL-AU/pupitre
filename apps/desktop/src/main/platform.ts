import type { TerminalSize } from "@shared/terminals";
import type { IPtyForkOptions, IWindowsPtyForkOptions } from "node-pty";

// Functions of a platform name, not `process.platform` reads, so a Mac can test what Windows gets.

export type Platform = NodeJS.Platform;

export function current(): Platform {
  return process.platform;
}

/** Windows OpenSSH rejects `controlmaster` and with it the whole config file. */
export function multiplexes(platform: Platform): boolean {
  return platform !== "win32";
}

/** `HOME` is empty on Windows: a pty with no cwd would open in `C:\Windows\system32`. */
export function homeDirectory(
  platform: Platform,
  env: NodeJS.ProcessEnv
): string | undefined {
  return platform === "win32" ? env.USERPROFILE : env.HOME;
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

/** ConPTY by name: node-pty's winpty fallback mangles the escape sequences xterm draws from. */
export function terminalOptions(
  size: TerminalSize,
  platform: Platform,
  env: NodeJS.ProcessEnv
): IPtyForkOptions | IWindowsPtyForkOptions {
  const common = {
    cols: size.cols,
    cwd: homeDirectory(platform, env),
    env: env as Record<string, string>,
    name: "xterm-256color",
    rows: size.rows,
  };

  return platform === "win32" ? { ...common, useConpty: true } : common;
}
