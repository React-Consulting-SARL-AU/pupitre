import type { View } from "@renderer/stores/navigation";
import type { OnboardingView } from "@renderer/stores/onboarding-machine";
import type { UsageRight } from "@shared/account";

/**
 * Which of the shells the app is in.
 *
 * The account comes first, and it comes before the usage right: the app opens
 * on the sign-in as long as nobody is signed in on this computer, whatever a
 * development build would otherwise grant itself. After that, a server without
 * an agent and a server that answers are two different screens, and `snapshot`
 * is what tells them apart. The settings stay reachable in every case: that is
 * where a platform address, a proxy or the account itself is repaired.
 */
export type Shell =
  | "account"
  | "onboarding"
  | "settings"
  | "unready"
  | "server";

export function shellScreen({
  usage,
  signedIn,
  bypassed,
  onboarding,
  serverId,
  answered,
  view,
}: {
  /** What the main process said about the right to work, `refusalFor` aside. */
  usage: UsageRight;
  /** Whether an identity came back from this computer's keychain. */
  signedIn: boolean;
  /** Whether a development build was told, this run, to work without one. */
  bypassed: boolean;
  onboarding: OnboardingView;
  serverId: string | null;
  /** Whether `snapshot` has come back for this server. */
  answered: boolean;
  view: View;
}): Shell {
  if (usage.status !== "granted" || !(signedIn || bypassed)) {
    return view === "settings" ? "settings" : "account";
  }

  // The onboarding comes next: it is what a server that answers nothing yet
  // needs, and no dashboard has anything to say about a bare machine.
  if (onboarding !== "closed") {
    return "onboarding";
  }

  if (serverId && answered) {
    return "server";
  }

  return view === "settings" ? "settings" : "unready";
}
