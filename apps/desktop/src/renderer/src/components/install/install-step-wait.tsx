import { useTranslations } from "@renderer/i18n/use-translations";
import { useElapsed } from "@renderer/lib/use-elapsed";

/** Past this, a step that has said nothing owes the reader a word. */
export const PATIENCE_MS = 180_000;

/**
 * What a long silence means, said once it has become one.
 *
 * The counter beside the step already says the wait is moving; this says
 * whether it is still ordinary, and what to do when it no longer is. Mounted
 * anew for each step, so the clock starts with the step and not with the module.
 */
export function InstallStepWait() {
  const t = useTranslations();
  const waited = useElapsed(true);

  if (waited < PATIENCE_MS) {
    return null;
  }

  return (
    <p
      className="mt-1 text-[12px] text-ink-3 leading-relaxed"
      data-patience="true"
    >
      {t("install.stepLong")}
    </p>
  );
}
