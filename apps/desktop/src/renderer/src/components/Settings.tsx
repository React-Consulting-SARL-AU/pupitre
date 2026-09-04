import type { Capabilities, ServersConfig } from "@shared/contract";
import { cleanProfile } from "@shared/profile";
import { Boxes, Palette, Server as ServerIcon } from "lucide-react";
import { useState } from "react";
import {
  THEME_PREFERENCES,
  type ThemePreference,
  useTheme,
} from "../stores/theme";
import { Projects } from "./Projects";
import { ServersPanel } from "./servers/servers-panel";
import { Field, fieldControlClass } from "./ui/field";
import { PageHeader } from "./ui/page-header";

const THEME_LABEL: Record<ThemePreference, string> = {
  system: "Follow the system",
  light: "Light",
  dark: "Dark",
};

type Section = "servers" | "projects" | "appearance";

export function Settings({
  config,
  capabilities,
  onChanged,
}: {
  config: ServersConfig;
  capabilities: Capabilities | null;
  /** The app state holds its own copy of the servers: it re-reads on a change. */
  onChanged: () => void;
}) {
  const [section, setSection] = useState<Section>("servers");

  const hasRegistry = capabilities?.registry !== false;
  const activeCommand = cleanProfile(
    config.servers.find((s) => s.id === config.active)?.profile
  ).command;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Settings" />

        <div className="mt-4 mb-8 flex gap-1 border-line border-b">
          <Tab
            active={section === "servers"}
            icon={ServerIcon}
            onClick={() => setSection("servers")}
          >
            Servers
          </Tab>
          {hasRegistry ? (
            <Tab
              active={section === "projects"}
              icon={Boxes}
              onClick={() => setSection("projects")}
            >
              Projects
            </Tab>
          ) : null}
          <Tab
            active={section === "appearance"}
            icon={Palette}
            onClick={() => setSection("appearance")}
          >
            Appearance
          </Tab>
        </div>

        {section === "projects" && hasRegistry ? (
          <Projects command={activeCommand} />
        ) : null}

        {section === "appearance" ? <Appearance /> : null}

        <div hidden={section !== "servers"}>
          <ServersPanel onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

/**
 * Light, dark, or whatever the system says.
 *
 * The choice lands on `<html data-theme>`, which is what the tokens of
 * `@pupitre/design` key off: the window, the panels and the open terminals turn
 * over on the spot, with nothing reloaded and no session lost.
 */
function Appearance() {
  const preference = useTheme((t) => t.preference);
  const resolved = useTheme((t) => t.resolved);
  const setPreference = useTheme((t) => t.setPreference);

  return (
    <div className="max-w-sm">
      <p className="text-ink-3 leading-relaxed">
        The interface is monochrome by design: no accent colour, and colour only
        for the state of things. The theme applies at once, terminals included.
      </p>

      <div className="mt-4">
        <Field help={`currently showing the ${resolved} theme`} label="Theme">
          <select
            className={fieldControlClass}
            onChange={(e) => setPreference(e.target.value as ThemePreference)}
            value={preference}
          >
            {THEME_PREFERENCES.map((option) => (
              <option key={option} value={option}>
                {THEME_LABEL[option]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Tab({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon: typeof ServerIcon;
}) {
  return (
    <button
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-soft ${
        active
          ? "border-ink font-medium text-ink"
          : "border-transparent text-ink-3 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={13} strokeWidth={1.5} />
      {children}
    </button>
  );
}
