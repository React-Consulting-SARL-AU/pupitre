import { useTranslations } from "@renderer/i18n/use-translations";
import {
  BACKUP_SETUP_STEPS,
  type BackupSetupStep,
} from "@renderer/lib/backup-setup";
import { Check } from "lucide-react";

export function BackupsSetupProgress({
  current,
  onGo,
}: {
  current: BackupSetupStep;
  onGo: (step: BackupSetupStep) => void;
}) {
  const t = useTranslations();

  const steps = BACKUP_SETUP_STEPS;
  const here = steps.indexOf(current);

  return (
    <ol
      aria-label={t("backups.setup.progress")}
      className="flex flex-wrap items-center gap-x-2 gap-y-3 border-line border-b px-6 py-4"
    >
      {steps.map((step, index) => {
        const done = index < here;
        const now = index === here;
        const label = t(`backups.setup.step.${step}`);

        let mark = "border-line text-ink-4";

        if (done) {
          mark = "border-inverse bg-inverse text-inverse-ink";
        } else if (now) {
          mark = "border-ink text-ink";
        }

        const content = (
          <>
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-data text-caption tabular-nums transition-soft ${mark}`}
            >
              {done ? <Check size={12} strokeWidth={2} /> : index + 1}
            </span>
            <span
              className={`text-control transition-soft ${now ? "font-medium text-ink" : "text-ink-3"}`}
            >
              {label}
            </span>
          </>
        );

        return (
          <li
            aria-current={now ? "step" : undefined}
            className="flex items-center gap-2"
            data-setup-step={step}
            key={step}
          >
            {done ? (
              <button
                className="clickable flex cursor-pointer items-center gap-2 rounded-md py-0.5 pr-1 hover:text-ink"
                onClick={() => onGo(step)}
                type="button"
              >
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-2 py-0.5 pr-1">
                {content}
              </span>
            )}

            {index === steps.length - 1 ? null : (
              <span
                aria-hidden="true"
                className={`h-px w-6 transition-soft ${done ? "bg-ink-3" : "bg-line"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
