import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAppUpdate } from "@renderer/stores/app-update";
import { useEffect } from "react";
import { SettingsAboutBuild } from "./settings-about-build";
import { SettingsAboutHelp } from "./settings-about-help";
import { SettingsAboutUpdate } from "./settings-about-update";

export function SettingsAbout() {
  const t = useTranslations();

  const about = useAppUpdate((store) => store.about);
  const state = useAppUpdate((store) => store.state);
  const read = useAppUpdate((store) => store.read);
  const listen = useAppUpdate((store) => store.listen);
  const check = useAppUpdate((store) => store.check);
  const install = useAppUpdate((store) => store.install);

  useEffect(() => {
    read();

    return listen();
  }, [read, listen]);

  return (
    <>
      <Section name="about" title={t("settings.section.about")}>
        {about && state ? (
          <Panel inset="lg">
            <SettingsAboutBuild about={about} />

            <div className="mt-6 border-line border-t pt-5">
              <SettingsAboutUpdate
                onCheck={check}
                onInstall={install}
                state={state}
              />
            </div>
          </Panel>
        ) : (
          <WaitingLine>{t("settings.about.reading")}</WaitingLine>
        )}
      </Section>

      <SettingsAboutHelp />
    </>
  );
}
