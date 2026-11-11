import { APP_MCP_NAME } from "@pupitre/shared/desktop-mcp";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SwitchLine } from "@renderer/components/ui/switch";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useLocalAgents } from "@renderer/stores/local-agents";
import { useEffect } from "react";
import { SettingsAgentsClient } from "./settings-agents-client";
import { SettingsAgentsEntry } from "./settings-agents-entry";

export function SettingsAgents() {
  const t = useTranslations();

  const state = useLocalAgents((store) => store.state);
  const read = useLocalAgents((store) => store.read);
  const set = useLocalAgents((store) => store.set);
  const setUnattended = useLocalAgents((store) => store.setUnattended);

  useEffect(() => {
    read();
  }, [read]);

  if (!state) {
    return (
      <Section name="agents" title={t("settings.section.agents")}>
        <WaitingLine>{t("settings.agents.reading")}</WaitingLine>
      </Section>
    );
  }

  return (
    <>
      <Section name="agents" title={t("settings.section.agents")}>
        <Panel className="flex flex-col gap-6" inset="lg">
          <SwitchLine
            checked={state.enabled}
            detail={
              state.supported
                ? t("settings.agents.detail")
                : t("settings.agents.unsupported")
            }
            disabled={!state.supported}
            label={t("settings.agents.label")}
            name="settings.agents"
            onChange={set}
          />
          <SwitchLine
            checked={state.unattended}
            detail={t("settings.agents.unattendedDetail")}
            disabled={!state.enabled}
            label={t("settings.agents.unattended")}
            name="settings.agents.unattended"
            onChange={setUnattended}
          />
        </Panel>
      </Section>

      <Section name="agents-clients" title={t("settings.agents.clients")}>
        <Panel list>
          {state.clients.map((client) => (
            <SettingsAgentsClient
              client={client}
              enabled={state.enabled}
              key={client.id}
            />
          ))}
        </Panel>
      </Section>

      {state.enabled ? (
        <Section name="agents-entries" title={t("settings.agents.entries")}>
          <Panel list>
            <SettingsAgentsEntry
              description={t("settings.agents.entry.app")}
              name={APP_MCP_NAME}
            />
            {state.machines.map((machine) => (
              <SettingsAgentsEntry
                description={t("settings.agents.entry.machine", {
                  server: machine.serverName,
                })}
                key={machine.entry}
                name={machine.entry}
              />
            ))}
          </Panel>
        </Section>
      ) : null}
    </>
  );
}
