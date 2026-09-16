import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { settled, type Transfer } from "@shared/transfers";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { CountPill } from "../ui/count-pill";
import { ErrorNotice } from "../ui/error-notice";
import { IconButton } from "../ui/icon-button";
import { Label } from "../ui/label";
import { TransferRow } from "./transfer-row";

/**
 * The transfers drawn: a count of what is moving, a fold, one row each.
 *
 * Nothing shows while the list is empty and nothing was refused. The panel
 * folds on a click and keeps its count, because a dump takes minutes and the
 * reader has gone elsewhere by then.
 */
export function TransfersList({
  transfers,
  problem,
  onPause,
  onResume,
  onCancel,
  onDismiss,
  onDismissProblem,
}: {
  transfers: readonly Transfer[];
  problem: AgentError | null;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onDismissProblem: () => void;
}) {
  const t = useTranslations();

  const [folded, setFolded] = useState(false);

  const moving = transfers.filter((one) => !settled(one)).length;

  if (transfers.length === 0 && problem === null) {
    return null;
  }

  return (
    <section
      aria-label={t("transfers.panel")}
      className="mx-2 flex flex-col rounded-md border border-line bg-base"
      data-transfers={transfers.length}
      data-transfers-moving={moving}
    >
      <header className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Label>{t("transfers.panel")}</Label>
          {moving > 0 ? (
            <CountPill>{t.plural("transfers.panel.count", moving)}</CountPill>
          ) : null}
        </span>
        <IconButton
          expanded={!folded}
          icon={folded ? ChevronUp : ChevronDown}
          label={t("transfers.panel.toggle")}
          onClick={() => setFolded((held) => !held)}
          size={12}
          variant="discreet"
        />
      </header>

      {folded ? null : (
        <>
          {problem ? (
            <div className="px-2 pb-2">
              <ErrorNotice error={problem} onDismiss={onDismissProblem} />
            </div>
          ) : null}
          <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto">
            {transfers.map((transfer) => (
              <TransferRow
                key={transfer.id}
                onCancel={() => onCancel(transfer.id)}
                onDismiss={() => onDismiss(transfer.id)}
                onPause={() => onPause(transfer.id)}
                onResume={() => onResume(transfer.id)}
                transfer={transfer}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
