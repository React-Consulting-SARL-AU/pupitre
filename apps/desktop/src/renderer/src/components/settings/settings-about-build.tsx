import { Label } from "@renderer/components/ui/label";
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
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <dt>
          <Label>{t("settings.about.version")}</Label>
        </dt>
        <dd
          className="mt-1 font-data text-[12px] text-ink tabular-nums"
          data-app-version={about.version}
        >
          {about.version}
        </dd>
      </div>
      <div className="min-w-0">
        <dt>
          <Label>{t("settings.about.channel")}</Label>
        </dt>
        <dd className="mt-1 text-[12px] text-ink-2">
          {channelLabel(about, t)}
        </dd>
      </div>
    </dl>
  );
}
