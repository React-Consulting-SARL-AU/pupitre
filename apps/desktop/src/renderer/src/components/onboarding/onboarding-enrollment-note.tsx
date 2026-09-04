import { StatusDot } from "@renderer/components/ui/status-dot";
import type { EnrollmentSummary } from "@shared/account";

/**
 * The server as the console now knows it.
 *
 * Nothing of the enrolment token appears here: it stayed in the main process,
 * on its way to the agent. What the reader gets is the identity the platform
 * gave the machine and the release it named.
 */
export function OnboardingEnrollmentNote({
  enrollment,
}: {
  enrollment: EnrollmentSummary | null;
}) {
  if (!enrollment) {
    return null;
  }

  return (
    <div
      className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4"
      data-enrolled={enrollment.serverId}
    >
      <span className="translate-y-1">
        <StatusDot shape="filled" size={12} tone="ok" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">Serveur enrôlé</p>
        <p className="mt-1 text-ink-3 leading-relaxed">
          Il apparaît dans la console avec son heartbeat dès que l'agent parle à
          la plateforme.
        </p>
        <p className="mt-2 break-all font-data text-[11px] text-ink-4">
          {enrollment.serverId} · pupitred {enrollment.release.version} ·{" "}
          {enrollment.release.channel}
        </p>
      </div>
    </div>
  );
}
