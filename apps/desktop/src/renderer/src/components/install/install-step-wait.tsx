import { useTranslations } from "@renderer/i18n/use-translations";
import { useElapsed } from "@renderer/lib/use-elapsed";

export const PATIENCE_MS = 180_000;

// The parent keys this per step, so the clock restarts with each one.
export function InstallStepWait() {
  const t = useTranslations();
  const waited = useElapsed(true);

  if (waited < PATIENCE_MS) {
    return null;
  }

  return (
    <p
      className="mt-1 text-ink-3 text-small leading-relaxed"
      data-patience="true"
    >
      {t("install.stepLong")}
    </p>
  );
}
