import type { PendingKeyApproval } from "@pupitre/shared/keys";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ApprovalProgress } from "@renderer/stores/key-approvals";
import { approvalKeyOf } from "@shared/key-approvals";
import { KeyRound, ShieldCheck } from "lucide-react";

export function AccountKeyApprovalRow({
  approval,
  progress,
  onApprove,
}: {
  approval: PendingKeyApproval;
  progress: ApprovalProgress | undefined;
  onApprove: (approval: PendingKeyApproval) => Promise<void>;
}) {
  const t = useTranslations();

  const device = approval.device.name;
  const server = approval.server.name;
  const person = approval.user.name || approval.user.email;

  return (
    <li
      className="flex flex-col gap-3 px-4 py-3"
      data-approval={approvalKeyOf(approval)}
    >
      <div className="flex items-center gap-3">
        <KeyRound className="shrink-0 text-ink-3" size={14} strokeWidth={1.5} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">
            {t("keyApprovals.request", { device, person, server })}
          </p>
          <p className="flex min-w-0 gap-2 font-data text-[11px] text-ink-3">
            <span className="truncate">{approval.user.email}</span>
            <span className="truncate">{approval.device.fingerprint}</span>
          </p>
        </div>

        {progress?.status === "allowed" ? null : (
          <Button
            icon={ShieldCheck}
            onClick={() => onApprove(approval)}
            size="sm"
          >
            {t("keyApprovals.allow")}
          </Button>
        )}
      </div>

      {progress?.status === "allowed" ? (
        <Callout bare name="key-approval-allowed" tone="ok">
          {t("keyApprovals.allowed", { device, server })}
        </Callout>
      ) : null}

      {progress?.status === "refused" ? (
        <ErrorNotice bare error={progress.error} />
      ) : null}
    </li>
  );
}
