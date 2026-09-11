import { useTransfers } from "@renderer/stores/transfers";
import { useEffect } from "react";
import { TransfersList } from "./transfers-list";

/**
 * The transfers, at the foot of the sidebar, from any screen.
 *
 * This is where the window starts listening to the main process: the list is
 * the main process's and comes whole with every change, and the rows stay
 * reachable from every screen for as long as something is moving.
 */
export function TransfersPanel() {
  const transfers = useTransfers((state) => state.transfers);
  const problem = useTransfers((state) => state.problem);
  const follow = useTransfers((state) => state.follow);
  const pause = useTransfers((state) => state.pause);
  const resume = useTransfers((state) => state.resume);
  const cancel = useTransfers((state) => state.cancel);
  const dismiss = useTransfers((state) => state.dismiss);
  const dismissProblem = useTransfers((state) => state.dismissProblem);

  useEffect(() => follow(), [follow]);

  return (
    <TransfersList
      onCancel={cancel}
      onDismiss={dismiss}
      onDismissProblem={dismissProblem}
      onPause={pause}
      onResume={resume}
      problem={problem}
      transfers={transfers}
    />
  );
}
