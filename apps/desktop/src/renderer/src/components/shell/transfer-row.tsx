import { agentText } from "@renderer/i18n/agent-error";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { rate as paceOf, uptime, weight } from "@renderer/lib/format";
import { settled, type Transfer } from "@shared/transfers";
import { ArrowDownToLine, ArrowUpFromLine, Pause, Play, X } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import { StatusDot, type StatusShape, type StatusTone } from "../ui/status-dot";

const LOOK: Record<
  Transfer["status"],
  { shape: StatusShape; tone: StatusTone; label: DictionaryKey | null }
> = {
  cancelled: {
    label: "transfers.row.cancelled",
    shape: "empty",
    tone: "neutral",
  },
  done: { label: "transfers.row.done", shape: "filled", tone: "ok" },
  failed: { label: "transfers.row.failed", shape: "struck", tone: "danger" },
  paused: { label: "transfers.row.paused", shape: "empty", tone: "neutral" },
  queued: { label: "transfers.row.queued", shape: "ringed", tone: "neutral" },
  running: { label: null, shape: "breathing", tone: "neutral" },
};

const HUNDRED = 100;

function percentOf(transfer: Transfer): number | null {
  if (transfer.status === "done") {
    return HUNDRED;
  }

  return transfer.total && transfer.total > 0
    ? Math.min(HUNDRED, Math.floor((transfer.done * HUNDRED) / transfer.total))
    : null;
}

export function TransferRow({
  transfer,
  onPause,
  onResume,
  onCancel,
  onDismiss,
}: {
  transfer: Transfer;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const t = useTranslations();

  const look = LOOK[transfer.status];
  const percent = percentOf(transfer);
  const over = settled(transfer);
  const Direction =
    transfer.direction === "upload" ? ArrowUpFromLine : ArrowDownToLine;
  const said = transfer.error ? agentText(t, transfer.error) : null;

  const figures: string[] = [];

  if (transfer.status === "running" || transfer.status === "paused") {
    figures.push(
      transfer.total
        ? t("transfers.row.progress", {
            done: weight(transfer.done),
            total: weight(transfer.total),
          })
        : t("transfers.row.progressUnknown", { done: weight(transfer.done) })
    );
  }

  if (transfer.status === "running" && transfer.rate) {
    figures.push(paceOf(transfer.rate));
  }

  if (transfer.status === "running" && transfer.remaining) {
    figures.push(
      t("transfers.row.remaining", { remaining: uptime(transfer.remaining) })
    );
  }

  if (look.label) {
    figures.unshift(t(look.label));
  }

  return (
    <li
      aria-label={t("transfers.row.label", { name: transfer.name })}
      className="flex flex-col gap-1.5 px-3 py-2"
      data-direction={transfer.direction}
      data-status={transfer.status}
      data-tool={transfer.tool}
      data-transfer={transfer.id}
    >
      <div className="flex items-center gap-2">
        <StatusDot shape={look.shape} size={9} tone={look.tone} />
        <Direction
          aria-label={t(`transfers.row.${transfer.direction}`)}
          className="shrink-0 text-ink-3"
          role="img"
          size={12}
          strokeWidth={1.5}
        />
        <span className="min-w-0 flex-1 truncate font-data text-ink text-small">
          {transfer.name}
        </span>

        {over ? (
          <IconButton
            icon={X}
            label={t("transfers.action.dismiss", { name: transfer.name })}
            onClick={onDismiss}
            size={11}
            variant="discreet"
          />
        ) : (
          <>
            {transfer.status === "paused" ? (
              <IconButton
                icon={Play}
                label={t("transfers.action.resume", { name: transfer.name })}
                onClick={onResume}
                size={11}
                variant="discreet"
              />
            ) : (
              <IconButton
                icon={Pause}
                label={t("transfers.action.pause", { name: transfer.name })}
                onClick={onPause}
                size={11}
                variant="discreet"
              />
            )}
            <IconButton
              icon={X}
              label={t("transfers.action.cancel", { name: transfer.name })}
              onClick={onCancel}
              size={11}
              variant="danger"
            />
          </>
        )}
      </div>

      {over ? null : (
        <div
          aria-label={t("transfers.row.label", { name: transfer.name })}
          aria-valuemax={HUNDRED}
          aria-valuemin={0}
          aria-valuenow={percent ?? undefined}
          className="h-1 w-full overflow-hidden rounded-full bg-sunken"
          role="progressbar"
        >
          <div
            className={`h-full rounded-full bg-ink transition-soft ${
              percent === null ? "w-1/4 animate-breathe" : ""
            }`}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      )}

      <p className="font-data text-caption text-ink-3 tabular-nums leading-relaxed">
        {figures.join(" · ")}
      </p>

      {transfer.tool === "scp" && !over ? (
        <p className="text-caption text-ink-3 leading-relaxed">
          {t("transfers.row.scp")}
        </p>
      ) : null}

      {said ? (
        <p className="text-caption text-ink-2 leading-relaxed" role="status">
          {said.message}
          {said.fix ? (
            <span className="block text-ink-3">{said.fix}</span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}
