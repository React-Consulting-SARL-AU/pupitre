import type {
  ProbeResult,
  ProbeVerdict,
} from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Label } from "../ui/label";
import { Panel } from "../ui/panel";
import type { StatusShape, StatusTone } from "../ui/status-dot";
import { StatusDot } from "../ui/status-dot";
import { OnboardingInspectionSummary } from "./onboarding-inspection-summary";

type Kind = ProbeVerdict["kind"];

const LOOK: Record<Kind, { shape: StatusShape; tone: StatusTone }> = {
  bare: { shape: "empty", tone: "neutral" },
  managed: { shape: "filled", tone: "ok" },
  occupied: { shape: "ringed", tone: "warn" },
  incompatible: { shape: "struck", tone: "danger" },
};

// Their only reason restates the title; printing it again reads as a fault.
const RESTATED: readonly Kind[] = ["bare", "managed"];

/** Prints `reasons` and `fixes` verbatim: they describe the machine that answered. */
export function OnboardingInspectionVerdict({ probe }: { probe: ProbeResult }) {
  const t = useTranslations();

  const { verdict } = probe;
  const look = LOOK[verdict.kind];

  return (
    <Panel
      as="article"
      className="flex flex-col gap-gutter"
      data-kind={verdict.kind}
      inset="lg"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <StatusDot shape={look.shape} size={12} tone={look.tone} />
          <h2 className="font-semibold text-base text-ink">
            {t(`onboarding.verdict.${verdict.kind}.title`)}
          </h2>
          {probe.agent_version ? (
            <span className="font-data text-ink-3">
              pupitred {probe.agent_version}
            </span>
          ) : null}
        </div>
        <p className="text-ink-3 leading-relaxed">
          {t(`onboarding.verdict.${verdict.kind}.lead`)}
        </p>
      </header>

      {verdict.kind === "bare" ? (
        <OnboardingInspectionSummary probe={probe} />
      ) : null}

      {verdict.kind === "managed" ? (
        <p className="text-ink-2">
          {verdict.up_to_date === false
            ? t("onboarding.verdict.updateAvailable")
            : t("onboarding.verdict.upToDate")}
        </p>
      ) : null}

      {verdict.reasons.length > 0 && !RESTATED.includes(verdict.kind) ? (
        <section className="flex flex-col gap-2">
          <Label>{t("onboarding.verdict.reasonsLabel")}</Label>
          <ul className="flex flex-col gap-2">
            {verdict.reasons.map((reason) => (
              <li
                className="border-line-strong border-l-2 pl-3 text-ink leading-relaxed"
                key={reason}
              >
                {reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {verdict.fixes.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-sm bg-sunken p-4">
          <Label>{t("onboarding.verdict.fixesLabel")}</Label>
          <ul className="flex flex-col gap-2">
            {verdict.fixes.map((fix) => (
              <li className="text-ink-2 leading-relaxed" key={fix}>
                {fix}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}
