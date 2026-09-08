import { useEffect } from "react";
import { type AccountView, accountOf, useAccount } from "../stores/account";
import { useFleet } from "../stores/fleet";

/**
 * The app, kept aware of what the platform does without it.
 *
 * A server granted, a key pushed, a subscription suspended, a server revoked
 * from the console: none of that goes through the app, and a screen that only
 * re-reads when it opens shows the state of an hour ago. The heartbeat lives
 * here, above the screens, so the list is fresh everywhere and not only where a
 * panel asked for it.
 *
 * A backgrounded window asks for nothing — what nobody is looking at need not
 * be fresh — and coming back to the foreground re-reads at once.
 */
const BEAT_MS = 15_000;

/**
 * Who the beat follows, as a value that survives a refresh unchanged.
 *
 * Every refresh sets a freshly cloned account, so an effect keyed on the
 * identity itself re-runs on its own answer: a beat with no interval, a
 * thousand calls a second, and a dev server out of ephemeral ports.
 */
export function syncKey(view: AccountView): string | null {
  return accountOf(view)?.identity?.email ?? null;
}

export function usePlatformSync(): void {
  const key = useAccount((store) => syncKey(store.view));

  useEffect(() => {
    if (!key) {
      return;
    }

    function follow() {
      if (document.hidden) {
        return;
      }

      useAccount.getState().refresh();
      useFleet.getState().read();
    }

    follow();

    const beat = setInterval(follow, BEAT_MS);

    window.addEventListener("focus", follow);
    document.addEventListener("visibilitychange", follow);

    return () => {
      clearInterval(beat);
      window.removeEventListener("focus", follow);
      document.removeEventListener("visibilitychange", follow);
    };
  }, [key]);
}
