import { AccountPanel } from "@renderer/components/account/account-panel";
import { ServersPanel } from "@renderer/components/servers/servers-panel";
import { Button } from "@renderer/components/ui/button";
import { Screen } from "@renderer/components/ui/screen";
import { Tab, TabBar } from "@renderer/components/ui/tab-bar";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { SettingsAbout } from "./settings-about";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsConnections } from "./settings-connections";
import { SettingsNotifications } from "./settings-notifications";
import { SettingsSsh } from "./settings-ssh";
import { SettingsStartup } from "./settings-startup";
import { SettingsTerminal } from "./settings-terminal";

export type SettingsSection =
  | "servers"
  | "account"
  | "connections"
  | "appearance"
  | "terminal"
  | "ssh"
  | "notifications"
  | "startup"
  | "about";

const SECTIONS: readonly SettingsSection[] = [
  "servers",
  "account",
  "connections",
  "appearance",
  "terminal",
  "ssh",
  "notifications",
  "startup",
  "about",
];

export function SettingsScreen({
  onChanged,
  onBack,
  openAt = "servers",
}: {
  onChanged: () => void;
  /** Only when opened outside the shell, which has no sidebar to leave by. */
  onBack?: () => void;
  openAt?: SettingsSection;
}) {
  const t = useTranslations();

  const [section, setSection] = useState<SettingsSection>(openAt);

  // Not in the band: its corners belong to the window's own buttons.
  const back = onBack ? (
    <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
      {t("settings.back")}
    </Button>
  ) : undefined;

  return (
    <div className="flex h-full flex-col bg-surface">
      {onBack ? <WindowBand /> : null}

      <div className="min-h-0 flex-1">
        <Screen
          actions={back}
          eyebrow={t("settings.eyebrow")}
          title={t("settings.title")}
        >
          <div className="flex items-start gap-12">
            <TabBar
              label={t("settings.sections")}
              onChange={setSection}
              orientation="vertical"
              value={section}
            >
              {SECTIONS.map((id) => (
                <Tab key={id} orientation="vertical" value={id}>
                  {t(`settings.section.${id}`)}
                </Tab>
              ))}
            </TabBar>

            <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-section">
              {section === "account" ? <AccountPanel /> : null}

              {section === "connections" ? <SettingsConnections /> : null}

              {section === "appearance" ? <SettingsAppearance /> : null}

              {section === "terminal" ? <SettingsTerminal /> : null}

              {section === "ssh" ? <SettingsSsh /> : null}

              {section === "notifications" ? <SettingsNotifications /> : null}

              {section === "startup" ? <SettingsStartup /> : null}

              {section === "about" ? <SettingsAbout /> : null}

              {/* Hidden, not unmounted: it holds a key being generated and a line to paste. */}
              <div hidden={section !== "servers"}>
                <ServersPanel onChanged={onChanged} />
              </div>
            </div>
          </div>
        </Screen>
      </div>
    </div>
  );
}
