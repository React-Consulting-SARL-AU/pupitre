import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useLocale } from "@renderer/stores/locale";
import type { HelpLink } from "@shared/help";
import { BookOpen, Mail, Scale } from "lucide-react";

export function SettingsAboutHelp() {
  const t = useTranslations();

  const language = useLocale((store) => store.resolved);

  const open = (link: HelpLink) => window.pupitre.openHelp(link, language);

  return (
    <Section name="help" title={t("settings.help.title")}>
      <Panel className="flex flex-wrap items-center gap-2" inset="lg">
        <Button icon={BookOpen} onClick={() => open("docs")}>
          {t("settings.help.docs")}
        </Button>
        <Button icon={Mail} onClick={() => open("support")}>
          {t("settings.help.support")}
        </Button>
        <Button icon={Scale} onClick={() => open("legal")}>
          {t("settings.help.legal")}
        </Button>
      </Panel>
    </Section>
  );
}
