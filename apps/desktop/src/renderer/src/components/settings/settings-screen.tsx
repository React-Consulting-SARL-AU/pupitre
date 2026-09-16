import { AccountPanel } from "@renderer/components/account/account-panel";
import { ServersPanel } from "@renderer/components/servers/servers-panel";
import { Button } from "@renderer/components/ui/button";
import { Screen } from "@renderer/components/ui/screen";
import { TabBar, TabButton } from "@renderer/components/ui/tab-bar";
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

/**
 * The settings, reachable from inside the app and from in front of it.
 *
 * In the shell the sidebar is the way back, and there is nothing to add. Opened
 * on its own — from the sign-in, or from a server that does not answer — it is
 * the whole window, and then it carries its own way out: without one the reader
 * repairs their account and stays stuck on the screen that repaired it.
 */
export function SettingsScreen({
  onChanged,
  onBack,
  openAt = "servers",
}: {
  onChanged: () => void;
  onBack?: () => void;
  /** The tab to land on, for a screen that sent the reader here to repair something. */
  openAt?: SettingsSection;
}) {
  const t = useTranslations();

  const [section, setSection] = useState<SettingsSection>(openAt);

  // Below the band rather than in it: the band's two corners belong to the
  // window's own buttons, and this screen reaches both of them.
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
          tabs={
            <TabBar>
              {SECTIONS.map((id) => (
                <TabButton
                  active={section === id}
                  key={id}
                  onClick={() => setSection(id)}
                >
                  {t(`settings.section.${id}`)}
                </TabButton>
              ))}
            </TabBar>
          }
          title={t("settings.title")}
        >
          {section === "account" ? <AccountPanel /> : null}

          {section === "connections" ? <SettingsConnections /> : null}

          {section === "appearance" ? <SettingsAppearance /> : null}

          {section === "terminal" ? <SettingsTerminal /> : null}

          {section === "ssh" ? <SettingsSsh /> : null}

          {section === "notifications" ? <SettingsNotifications /> : null}

          {section === "startup" ? <SettingsStartup /> : null}

          {section === "about" ? <SettingsAbout /> : null}

          {/*
          The servers panel keeps its state while the appearance tab is up: it
          holds a key being generated and a line to paste, and unmounting it
          would ask for both again.
        */}
          <div hidden={section !== "servers"}>
            <ServersPanel onChanged={onChanged} />
          </div>
        </Screen>
      </div>
    </div>
  );
}
