import { pathToFileURL } from "node:url";
import { isLocalPlatform } from "./platform-client";

export interface PageRules {
  devUrl: string | undefined;
  indexFile: string;
}

/** A development build may also open the plain-HTTP console running on this computer. */
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
      // A malformed dev address falls through to the bundled page.
    }
  }

  return (
    target.protocol === "file:" &&
    withoutFragment(target) === pathToFileURL(rules.indexFile).toString()
  );
}
