import { Logo } from "@renderer/components/logo";
import { StepFailure } from "@renderer/components/ui/step-failure";
import type { Gesture } from "@renderer/lib/use-pending";
import type { AgentError } from "@shared/agent";

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
