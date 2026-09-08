import { StartStepAction } from "@/components/dashboard/start-step-action"
import { Card } from "@/components/ui/card"
import { SkeletonRows } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { useOnboarding } from "@/hooks/use-onboarding"
import type {
  OnboardingStep,
  OnboardingStepState,
} from "@/lib/domain/onboarding"
import type { StatusLook } from "@/lib/domain/server-status"

export interface StartChecklistProps {
  /** On the download page, what is already done has no reason to take room. */
  compact?: boolean
}

const TITLE: Record<OnboardingStepState, string> = {
  done: "text-ink-3",
  current: "font-medium text-ink",
  ahead: "text-ink-3",
}

function dotFor(step: OnboardingStep): StatusLook {
  if (step.state === "done") {
    return { shape: "filled", tone: "ok", label: "onboarding.done" }
  }

  if (step.inProgress) {
    return { shape: "breathing", tone: "muted", label: "status.enrolling" }
  }

  return { shape: "hollow", tone: "muted", label: "onboarding.todo" }
}

export function StartChecklist({ compact = false }: StartChecklistProps) {
  const t = useTranslations()
  const { steps, ready } = useOnboarding()

  if (!ready) {
    return <SkeletonRows />
  }

  const shown = steps
    .map((step, index) => ({ step, rank: index + 1 }))
    .filter(({ step }) => !(compact && step.state === "done"))

  return (
    <Card>
      <ol>
        {shown.map(({ step, rank }) => {
          const dot = dotFor(step)

          return (
            <li
              aria-current={step.state === "current" ? "step" : undefined}
              className="flex gap-3 border-line border-b px-4 py-3.5 last:border-b-0"
              key={step.id}
            >
              <StatusDot
                className="mt-[3px]"
                label={t(dot.label)}
                shape={dot.shape}
                tone={dot.tone}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className={`text-[13px] ${TITLE[step.state]}`}>
                    <span className="pr-1.5 font-data text-ink-3 tabular-nums">
                      {rank}.
                    </span>
                    {t(step.title)}
                  </p>

                  {step.state === "done" ? (
                    <span className="shrink-0 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                      {t("onboarding.done")}
                    </span>
                  ) : null}
                </div>

                {step.state === "current" ? (
                  <>
                    <p className="text-[13px] text-ink-2">{t(step.lead)}</p>
                    <StartStepAction step={step} />
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
