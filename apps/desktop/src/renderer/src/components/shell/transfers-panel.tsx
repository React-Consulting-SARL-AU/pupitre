import { useTransfers } from "@renderer/stores/transfers";
import { useEffect } from "react";
import { TransfersList } from "./transfers-list";

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
