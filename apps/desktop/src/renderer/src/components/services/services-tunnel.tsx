import { Section } from "@renderer/components/ui/section";
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
    <Section
      data-tunnel="absent"
      name="tunnel"
      title={t("services.tunnel.title")}
    >
      <p className="text-ink-3 text-small">{t("services.tunnel.absent")}</p>
    </Section>
  );
}
