import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal";
import { Button } from "@renderer/components/ui/button";
import { Screen } from "@renderer/components/ui/screen";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useSshShare } from "@renderer/stores/ssh-share";
import type { SshShareServer, SshShareState } from "@shared/ssh-names";
import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { HelpClaudeSection } from "./help-claude-section";
import { HelpCodexSection } from "./help-codex-section";
import { HelpEditorsSection } from "./help-editors-section";
import { HelpReachSection } from "./help-reach-section";
import { HelpTroublesSection } from "./help-troubles-section";

export interface HelpTarget {
  server: SshShareServer;
  host: string;
  projectPath: string;
}

function targetOf(
  state: SshShareState,
  activeId: string | null,
  projectPath: string | null,
  placeholder: string
): HelpTarget | null {
  const server =
    state.servers.find((one) => one.id === activeId) ?? state.servers[0];

  if (!server) {
    return null;
  }

  return {
    host: state.shared ? server.ssh : `${server.user}@${server.host}`,
    projectPath: projectPath ?? placeholder,
    server,
  };
}

export function HelpScreen({
  activeId,
  services,
  projects,
  onSettings,
  onServices,
}: {
  activeId: string | null;
  services: readonly Service[];
  projects: readonly Project[];
  onSettings: () => void;
  onServices: () => void;
}) {
  const t = useTranslations();

  const state = useSshShare((store) => store.state);
  const read = useSshShare((store) => store.read);

  useEffect(() => {
    read();
  }, [read]);

  const target = state
    ? targetOf(
        state,
        activeId,
        projects[0]?.path ?? null,
        t("help.project.placeholder")
      )
    : null;

  const installed = (id: string) =>
    services.some((service) => service.id === id);

  return (
    <Screen
      actions={
        <Button
          icon={ExternalLink}
          onClick={() =>
            window.pupitre.openUrl(
              `${PUPITRE_ORIGINS.site}${t("help.guide.path")}`
            )
          }
        >
          {t("help.guide")}
        </Button>
      }
      eyebrow={t("help.eyebrow")}
      title={t("help.title")}
    >
      {state ? (
        <HelpReachSection onSettings={onSettings} state={state} />
      ) : (
        <WaitingLine>{t("settings.ssh.reading")}</WaitingLine>
      )}

      {target ? (
        <>
          <HelpClaudeSection
            installed={installed("ai.claude")}
            onServices={onServices}
            target={target}
          />
          <HelpCodexSection
            installed={installed("ai.codex")}
            onServices={onServices}
            target={target}
          />
          <HelpEditorsSection target={target} />
          <HelpTroublesSection target={target} />
        </>
      ) : null}
    </Screen>
  );
}
