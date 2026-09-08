import { AccountPanel } from "@renderer/components/account/account-panel";
import { ServersPanel } from "@renderer/components/servers/servers-panel";
import { Button } from "@renderer/components/ui/button";
import { PageHeader } from "@renderer/components/ui/page-header";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  ArrowLeft,
  Cloud,
  Palette,
  Server as ServerIcon,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsConnections } from "./settings-connections";

type Section = "servers" | "account" | "connections" | "appearance";

const SECTIONS: { id: Section; icon: typeof ServerIcon }[] = [
  { icon: ServerIcon, id: "servers" },
  { icon: UserRound, id: "account" },
  { icon: Cloud, id: "connections" },
  { icon: Palette, id: "appearance" },
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
}: {
  onChanged: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations();

  const [section, setSection] = useState<Section>("servers");

  return (
    <div className="flex h-full flex-col">
      {onBack ? <WindowBand /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          {/*
            In the column rather than in the band: the band's two corners belong
            to the window's own buttons, and this screen reaches both of them.
          */}
          {onBack ? (
            <div className="mb-4">
              <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
                {t("settings.back")}
              </Button>
            </div>
          ) : null}

          <PageHeader title={t("settings.title")} />

          <div className="mt-4 mb-8 flex gap-1 border-line border-b">
            {SECTIONS.map(({ id, icon: Icon }) => (
              <button
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-soft ${
                  section === id
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-ink-3 hover:text-ink"
                }`}
                key={id}
                onClick={() => setSection(id)}
                type="button"
              >
                <Icon size={13} strokeWidth={1.5} />
                {t(`settings.section.${id}`)}
              </button>
            ))}
          </div>

          {section === "account" ? <AccountPanel /> : null}

          {section === "connections" ? <SettingsConnections /> : null}

          {section === "appearance" ? <SettingsAppearance /> : null}

          {/*
          The servers panel keeps its state while the appearance tab is up: it
          holds a key being generated and a line to paste, and unmounting it
          would ask for both again.
        */}
          <div hidden={section !== "servers"}>
            <ServersPanel onChanged={onChanged} />
          </div>
        </div>
      </div>
    </div>
  );
}
