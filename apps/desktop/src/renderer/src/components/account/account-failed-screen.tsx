import { Logo } from "@renderer/components/logo";
import { StepFailure } from "@renderer/components/ui/step-failure";
import type { Gesture } from "@renderer/lib/use-pending";
import type { AgentError } from "@shared/agent";

/**
 * The app could not learn whether it may work.
 *
 * Nothing of a machine is behind this either: the keychain, or the bridge to
 * it, did not answer, and no server is judged on a right that was never read.
 * The sentence is the app's, the line under it is what was thrown, and the one
 * gesture asks again.
 */
export function AccountFailedScreen({
  error,
  onRetry,
}: {
  error: AgentError;
  onRetry: Gesture;
}) {
  return (
    <div
      className="draggable grid h-full place-items-center bg-base px-8"
      data-account="failed"
    >
      <div className="clickable fade-in flex w-full max-w-md flex-col items-center gap-5">
        <Logo size={34} />

        <div className="w-full">
          <StepFailure
            error={error}
            journal={<span className="font-data">{error.message}</span>}
            onRetry={() => onRetry()}
          />
        </div>
      </div>
    </div>
  );
}
