import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { Section } from "@renderer/components/ui/section";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { TileButton } from "@renderer/components/ui/tile-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentModule } from "@renderer/lib/modules";
import { isMac } from "@renderer/lib/platform";
import { agentChordLabel } from "@renderer/lib/project-shortcuts";
import type { TerminalAgent } from "@shared/terminals";
import { Bot, Boxes } from "lucide-react";

/**
 * The agents tab before any agent runs: one card per agent the machine holds,
 * under the logo of the module that put it there.
 *
 * Nothing starts on arrival — an agent is a session that costs a login and a
 * context, and the reader picks which one. A machine with no agent module says
 * where one is installed from.
 */
export function ProjectAgentsPicker({
  agents,
  onPick,
  onInstall,
}: {
  agents: readonly AgentModule[];
  onPick: (agent: TerminalAgent) => void;
  onInstall: () => void;
}) {
  const t = useTranslations();

  if (agents.length === 0) {
    return (
      <EmptyState
        action={
          <Button icon={Boxes} onClick={onInstall}>
            {t("project.agents.none.action")}
          </Button>
        }
        detail={t("project.agents.none.detail")}
        icon={Bot}
        title={t("project.agents.none.title")}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <Section name="agents" title={t("project.agents.pick")}>
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          data-agents-picker=""
        >
          {agents.map((held, index) => (
            <TileButton
              detail={
                held.version ? `${held.name} · ${held.version}` : held.name
              }
              key={held.agent}
              mark={
                <ServiceLogo
                  fallback={Bot}
                  moduleId={held.moduleId}
                  name={held.name}
                  size={32}
                />
              }
              onClick={() => onPick(held.agent)}
              shortcut={index === 0 ? agentChordLabel(isMac) : undefined}
            >
              {t(`terminals.kind.${held.agent}`)}
            </TileButton>
          ))}
        </div>
      </Section>
    </div>
  );
}
