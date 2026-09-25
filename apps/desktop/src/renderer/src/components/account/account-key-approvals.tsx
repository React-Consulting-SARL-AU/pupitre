import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useKeyApprovals } from "@renderer/stores/key-approvals";
import { approvalKeyOf } from "@shared/key-approvals";
import { useEffect } from "react";
import { AccountKeyApprovalRow } from "./account-key-approval-row";

export function AccountKeyApprovals() {
  const t = useTranslations();

  const state = useKeyApprovals((store) => store.state);
  const progress = useKeyApprovals((store) => store.progress);
  const read = useKeyApprovals((store) => store.read);
  const approve = useKeyApprovals((store) => store.approve);

  useEffect(() => {
    read();
  }, [read]);

  if (state.status !== "ready" || state.approvals.length === 0) {
    return null;
  }

  return (
    <Section name="key-approvals" title={t("keyApprovals.heading")}>
      <Panel inset="none" list>
        <ul className="contents">
          {state.approvals.map((approval) => (
            <AccountKeyApprovalRow
              approval={approval}
              key={approvalKeyOf(approval)}
              onApprove={approve}
              progress={progress[approvalKeyOf(approval)]}
            />
          ))}
        </ul>
      </Panel>
    </Section>
  );
}
