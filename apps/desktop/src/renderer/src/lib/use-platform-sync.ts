import { useEffect } from "react";
import { type AccountView, accountOf, useAccount } from "../stores/account";
import { useAgentUpdate } from "../stores/agent-update";
import { useFleet } from "../stores/fleet";

// The console grants, suspends and revokes without the app, so the beat lives above every screen.
const BEAT_MS = 15_000;

/** A primitive, because each refresh clones the account and an effect keyed on it re-ran in a hot loop. */
export function syncKey(view: AccountView): string | null {
  return accountOf(view)?.identity?.email ?? null;
}

export function usePlatformSync(serverId: string | null = null): void {
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

      if (serverId) {
        useAgentUpdate.getState().refresh(serverId);
      }
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
  }, [key, serverId]);
}
