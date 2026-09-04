import type { View } from "@renderer/stores/navigation";
import type { OnboardingView } from "@renderer/stores/onboarding";

/**
 * Which of the three shells the app is in.
 *
 * A server without an agent and a server that answers are two different
 * screens, and `snapshot` is what tells them apart — it is the first thing the
 * app asks. The settings stay reachable in every case: that is where you go
 * when the connection does not come up.
 */
export type Shell = "onboarding" | "settings" | "unready" | "server";

export function shellScreen({
  onboarding,
  serverId,
  answered,
  view,
}: {
  onboarding: OnboardingView;
  serverId: string | null;
  /** Whether `snapshot` has come back for this server. */
  answered: boolean;
  view: View;
}): Shell {
  // The onboarding comes first: it is what a server that answers nothing yet
  // needs, and no dashboard has anything to say about a bare machine.
  if (onboarding !== "closed") {
    return "onboarding";
  }

  if (serverId && answered) {
    return "server";
  }

  return view === "settings" ? "settings" : "unready";
}
