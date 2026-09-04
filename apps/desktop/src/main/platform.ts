import type { IPtyForkOptions, IWindowsPtyForkOptions } from "node-pty";

/**
 * What the three systems do not do the same way.
 *
 * Each difference is a function of a platform name rather than a read of
 * `process.platform` where it is used, so a test can ask what Windows would get
 * without running on Windows — which is the only way any of this gets checked
 * from a Mac.
 */

export type Platform = NodeJS.Platform;

export function current(): Platform {
  return process.platform;
}

/**
 * The OpenSSH that ships with Windows has no connection multiplexing: it
 * answers `Bad configuration option: controlmaster` and refuses the whole file,
 * so every server would become unreachable rather than merely slower.
 */
export function multiplexes(platform: Platform): boolean {
  return platform !== "win32";
}

/**
 * The home folder, asked of the variable the running system actually sets.
 *
 * `HOME` is empty on Windows, and a pty started with no working directory opens
 * wherever the app was launched from — `C:\Windows\system32`, when it comes
 * from the Start menu.
 */
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

/**
 * The frame the window asks its system for.
 *
 * The app draws no window buttons of its own, and `hiddenInset` is a macOS
 * value: Electron reads it elsewhere as "no frame at all", which on Windows
 * leaves a window with nothing to close it by. `titleBarOverlay` is how the
 * other two give back their own buttons over a page that keeps the whole
 * height.
 */
export function windowChrome(platform: Platform): WindowChrome {
  return platform === "darwin"
    ? { titleBarStyle: "hiddenInset" }
    : { titleBarOverlay: true, titleBarStyle: "hidden" };
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/**
 * The pty a terminal opens.
 *
 * ConPTY is what Windows 10 1809 and later provide. The alternative is winpty,
 * a separate agent binary node-pty falls back to on its own, and which mangles
 * the escape sequences xterm draws from. Asking for ConPTY by name means a
 * machine that cannot give it fails out loud instead of drawing a broken
 * terminal.
 */
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
