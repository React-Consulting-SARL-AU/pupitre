import type { View } from "@renderer/stores/navigation";
import type { OnboardingView } from "@renderer/stores/onboarding-machine";
import type { UsageRight } from "@shared/account";

export type Shell =
  | "account"
  | "onboarding"
  | "settings"
  | "unready"
  | "server";

/** Settings stay reachable from every shell: that is where the platform address, a proxy or the account get repaired. */
export function shellScreen({
  usage,
  signedIn,
  bypassed,
  onboarding,
  serverId,
  answered,
  view,
}: {
  usage: UsageRight;
  signedIn: boolean;
  /** A development build told, this run, to work without an account. */
  bypassed: boolean;
  onboarding: OnboardingView;
  serverId: string | null;
  /** `snapshot` has come back for this server. */
  answered: boolean;
  view: View;
}): Shell {
  if (usage.status !== "granted" || !(signedIn || bypassed)) {
    return view === "settings" ? "settings" : "account";
  }

  if (onboarding !== "closed") {
    return "onboarding";
  }

  if (serverId && answered) {
    return "server";
  }

  return view === "settings" ? "settings" : "unready";
}
