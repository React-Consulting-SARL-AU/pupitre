import { Logo } from "@renderer/components/logo";
import { Label } from "@renderer/components/ui/label";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";

export function AccountGateAside({ platform }: { platform: string }) {
  const t = useTranslations();

  return (
    <aside className="hidden flex-col justify-between border-line border-r bg-surface px-10 pt-2 pb-10 lg:flex">
      <div>
        <WindowBand />

        <div className="rise mt-6 flex items-center gap-3" style={riseAt(0)}>
          <Logo size={30} />
          <span className="font-bold font-display text-ink text-lg tracking-tight">
            Pupitre
          </span>
        </div>
      </div>

      <h2
        className="rise max-w-[22ch] text-balance font-bold font-display text-2xl text-ink leading-tight tracking-tight"
        style={riseAt(1)}
      >
        {t("account.gate.lead")}
      </h2>

      <div className="rise min-w-0" style={riseAt(2)}>
        <Label>{t("account.gate.platform")}</Label>
        <p className="mt-1 truncate font-data text-ink-3 text-small">
          {platform}
        </p>
      </div>
    </aside>
  );
}
