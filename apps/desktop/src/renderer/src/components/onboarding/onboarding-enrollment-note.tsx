import { Details } from "@renderer/components/ui/details";
import { Panel } from "@renderer/components/ui/panel";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { EnrollmentSummary } from "@shared/account";

/** Never shows the enrolment token: it stays in the main process. */
export function OnboardingEnrollmentNote({
  enrollment,
}: {
  enrollment: EnrollmentSummary | null;
}) {
  const t = useTranslations();

  if (!enrollment) {
    return null;
  }

  return (
    <Panel
      className="flex items-start gap-3"
      data-enrolled={enrollment.serverId}
    >
      <span className="translate-y-1">
        <StatusDot shape="filled" size={12} tone="ok" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">
          {t("onboarding.enrollment.title")}
        </p>
        <Details className="mt-1">
          <span className="font-data">
            {enrollment.serverId} · pupitred {enrollment.release.version} ·{" "}
            {enrollment.release.channel}
          </span>
        </Details>
      </div>
    </Panel>
  );
}
