import type { DictionaryKey } from "@renderer/i18n/en";
import type { HardenState } from "@renderer/stores/harden";

/**
 * The one gesture the hardening step ends on, and whether it is open yet.
 *
 * Root closed or kept: the sequence is over. Refused or stopped: the machine is
 * installed all the same, and the reader may go on with root open. While the
 * agent still works, the button is there but waits, and the note says on what.
 */
export function hardenAction(harden: HardenState): {
  label: DictionaryKey;
  enabled: boolean;
  note: DictionaryKey | null;
} {
  switch (harden.status) {
    case "done": {
      const hardened =
        harden.outcome.harden.root_closed || harden.outcome.harden.root_kept;

      return {
        enabled: true,
        label: hardened
          ? "onboarding.finish"
          : "onboarding.harden.continueOpen",
        note: null,
      };
    }
    case "failed":
      return {
        enabled: true,
        label: "onboarding.harden.continueOpen",
        note: "onboarding.harden.failedOpen",
      };
    case "queued":
      return {
        enabled: false,
        label: "onboarding.finish",
        note: "onboarding.harden.queuedTitle",
      };
    case "switching":
      return {
        enabled: false,
        label: "onboarding.finish",
        note: "onboarding.harden.switchingTitle",
      };
    default:
      return {
        enabled: false,
        label: "onboarding.finish",
        note: "onboarding.harden.runningTitle",
      };
  }
}
