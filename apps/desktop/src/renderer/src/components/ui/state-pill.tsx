import { useTranslations } from "@renderer/i18n/use-translations";
import type { StateLook } from "@renderer/lib/project-state";
import { StatusDot } from "./status-dot";

export function StatePill({ look, name }: { look: StateLook; name: string }) {
  const t = useTranslations();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-data text-caption text-ink-2 ${look.frame}`}
      data-state={name}
    >
      <StatusDot shape={look.shape} size={9} tone={look.tone} />
      {t(look.label)}
    </span>
  );
}
