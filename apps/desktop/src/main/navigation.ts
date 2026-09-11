import { pathToFileURL } from "node:url";
import { isLocalPlatform } from "./platform-client";

/**
 * Where the window may go, and where the browser may be sent.
 *
 * The renderer is a page the app ships: it never navigates, and a link it
 * carries opens in the system browser or not at all. What is decided here is
 * decided from the address alone, so a test can read it without a window.
 */

export interface PageRules {
  /** The dev server's address, when electron-vite serves the page. */
  devUrl: string | undefined;
  /** The bundled page, when it does not. */
  indexFile: string;
}

/**
 * A development build also opens the console running beside it, which speaks
 * plain HTTP on this computer. Everywhere else the browser only ever leaves for
 * an https address.
 */
export function openable(url: string, packaged: boolean): boolean {
  if (url.startsWith("https://")) {
    return true;
  }

  return !packaged && url.startsWith("http://") && isLocalPlatform(url);
}

function withoutFragment(url: URL): string {
  const bare = new URL(url);

  bare.hash = "";

  return bare.toString();
}

/** The app's own page, and nothing else: the one place the window may navigate to. */
export function ownPage(url: string, rules: PageRules): boolean {
  let target: URL;

  try {
    target = new URL(url);
  } catch {
    return false;
  }

  if (rules.devUrl) {
    try {
      const dev = new URL(rules.devUrl);

      if (target.origin === dev.origin && target.protocol.startsWith("http")) {
        return true;
      }
    } catch {
      // A dev address that is not one: the bundled page is what is left.
    }
  }

  return (
    target.protocol === "file:" &&
    withoutFragment(target) === pathToFileURL(rules.indexFile).toString()
  );
}
