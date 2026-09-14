import { Fact, FactList } from "@renderer/components/ui/fact";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AppAbout } from "@shared/app-update";

/** The build this is: its version, in the data face, and the channel it follows. */

function channelLabel(about: AppAbout, t: Translate): string {
  if (about.channel === null) {
    return t("settings.about.channel.none");
  }

  return about.channel === "beta"
    ? t("settings.about.channel.beta")
    : t("settings.about.channel.stable");
}

export function SettingsAboutBuild({ about }: { about: AppAbout }) {
  const t = useTranslations();

  return (
    <FactList>
      <Fact
        data-app-version={about.version}
        label={t("settings.about.version")}
      >
        {about.version}
      </Fact>
      <Fact label={t("settings.about.channel")} prose>
        {channelLabel(about, t)}
      </Fact>
    </FactList>
  );
}
