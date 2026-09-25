import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";

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
