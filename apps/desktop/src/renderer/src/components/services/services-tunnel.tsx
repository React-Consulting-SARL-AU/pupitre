import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";

/**
 * What stands for a tunnel on a server that has no exposure module.
 *
 * A module that is there has its own page, routes included; the list only
 * says what the absence means for the projects. The catalogue is where a
 * tunnel is added, not here.
 */
export function ServicesTunnel() {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-2" data-tunnel="absent">
      <Label>{t("services.tunnel.title")}</Label>
      <p className="text-[12px] text-ink-3">{t("services.tunnel.absent")}</p>
    </section>
  );
}
