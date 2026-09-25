import { useTranslations } from "@renderer/i18n/use-translations";
import type { DetectionState, SourceKind } from "../../stores/project-add";
import { LiveDuration } from "../ui/live-duration";
import { WaitingLine } from "../ui/waiting-line";

/**
 * What the source line says beneath itself.
 *
 * While the agent looks, the line says what it is cloning — the branch just
 * typed, or the repository's own — and counts the wait, so a reader who
 * changed the branch sees that the change was taken. Once it has looked, the
 * line keeps what it found.
 */
export function ProjectAddSourceStatus({
  detection,
  kind,
}: {
  detection: DetectionState;
  kind: SourceKind;
}) {
  const t = useTranslations();

  if (detection.status === "reading") {
    return (
      <WaitingLine className="text-small leading-relaxed">
        <span>{reading(t, detection, kind)}</span>
        <LiveDuration className="font-data tabular-nums" />
      </WaitingLine>
    );
  }

  if (detection.status === "read") {
    const { processes } = detection.result;
    const first = processes[0];

    if (processes.length > 1 || !first) {
      return (
        <p className="text-ink-3 text-small leading-relaxed">
          {t("projectAdd.form.sourceReadProcesses", {
            processes: processes.map((process) => process.id).join(", "),
          })}
        </p>
      );
    }

    const { pkgmgr, port_hint: port } = first;

    return (
      <p className="text-ink-3 text-small leading-relaxed">
        {port
          ? t("projectAdd.form.sourceRead", { pkgmgr, port })
          : t("projectAdd.form.sourceReadNoPort", { pkgmgr })}
      </p>
    );
  }

  return null;
}

function reading(
  t: ReturnType<typeof useTranslations>,
  detection: Extract<DetectionState, { status: "reading" }>,
  kind: SourceKind
): string {
  if (kind === "dir") {
    return t("projectAdd.form.sourceReadingDir");
  }

  return detection.branch
    ? t("projectAdd.form.sourceReadingBranch", { branch: detection.branch })
    : t("projectAdd.form.sourceReading");
}
