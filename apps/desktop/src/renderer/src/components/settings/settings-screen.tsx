import { ServersPanel } from "@renderer/components/servers/servers-panel";
import { PageHeader } from "@renderer/components/ui/page-header";
import { Palette, Server as ServerIcon } from "lucide-react";
import { useState } from "react";
import { SettingsAppearance } from "./settings-appearance";

type Section = "servers" | "appearance";

const SECTIONS: { id: Section; label: string; icon: typeof ServerIcon }[] = [
  { icon: ServerIcon, id: "servers", label: "Serveurs" },
  { icon: Palette, id: "appearance", label: "Apparence" },
];

export function SettingsScreen({ onChanged }: { onChanged: () => void }) {
  const [section, setSection] = useState<Section>("servers");

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Réglages" />

        <div className="mt-4 mb-8 flex gap-1 border-line border-b">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] transition-soft ${
                section === id
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-ink-3 hover:text-ink"
              }`}
              key={id}
              onClick={() => setSection(id)}
              type="button"
            >
              <Icon size={13} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>

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
  );
}
