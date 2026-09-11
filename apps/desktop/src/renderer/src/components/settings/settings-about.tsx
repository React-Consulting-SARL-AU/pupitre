import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAppUpdate } from "@renderer/stores/app-update";
import { useEffect } from "react";
import { SettingsAboutBuild } from "./settings-about-build";
import { SettingsAboutUpdate } from "./settings-about-update";

/**
 * The build this is, and where its next one stands.
 *
 * The version and the channel say what the reader runs; the updater's state
 * says what it is doing about the next one, and follows the main process's
 * broadcasts for as long as the section is open.
 */
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

  if (!(about && state)) {
    return <WaitingLine>{t("settings.about.reading")}</WaitingLine>;
  }

  return (
    <div className="max-w-sm">
      <div>
        <SettingsAboutBuild about={about} />
      </div>

      <div className="mt-6 border-line border-t pt-4">
        <SettingsAboutUpdate
          onCheck={check}
          onInstall={install}
          state={state}
        />
      </div>
    </div>
  );
}
