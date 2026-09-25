import type {
  LoginState,
  SnapshotResult,
} from "@pupitre/shared/agent-protocol/state";
import { ActivitySessions } from "@renderer/components/activity/activity-sessions";
import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { Panel } from "@renderer/components/ui/panel";
import { Screen } from "@renderer/components/ui/screen";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memoryOf } from "@renderer/lib/project-ports";
import { isRunning } from "@renderer/lib/project-state";
import type { SecuringNeed } from "@renderer/lib/server-security";
import type { Gesture } from "@renderer/lib/use-pending";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { FolderPlus, Package, Play, Power, Square } from "lucide-react";
import { useRef } from "react";
import { DashboardMachine } from "./dashboard-machine";
import { DashboardProjectCard } from "./dashboard-project-card";
import { DashboardRootNotice } from "./dashboard-root-notice";
import { DashboardServices } from "./dashboard-services";

interface Props {
  snapshot: SnapshotResult;
  serverName?: string;
  busy: string | null;
  attached: readonly string[];
  accounts?: Readonly<Record<string, LoginState>>;
  onOpenProject: (name: string) => void;
  onAddProject: () => void;
  onAct: Gesture<[ProjectAction, string]>;
  onStopSession: (pid: number) => void;
  /** Return the cleaning's promise so the button stays pending on it. */
  onCleanSessions: () => unknown;
  onReboot: () => void;
  onOpenService?: (moduleId: string) => void;
  onAddService?: () => void;
  onOpenTerminal?: () => void;
  securing?: SecuringNeed | null;
  onSecure?: () => void;
}

export function DashboardPanel({
  snapshot,
  serverName,
  busy,
  attached,
  accounts,
  onOpenProject,
  onAddProject,
  onAct,
  onStopSession,
  onCleanSessions,
  onReboot,
  onOpenService,
  onAddService,
  onOpenTerminal,
  securing = null,
  onSecure,
}: Props) {
  const t = useTranslations();

  const projectsHeading = useRef<HTMLHeadingElement | null>(null);

  const machineName = serverName ?? snapshot.machine.hostname;

  const projects = snapshot.projects;
  const up = projects.filter((project) => isRunning(project.state));
  const broken = projects.filter(
    (project) => project.state === "failed" || project.state === "down"
  );
  const projectsRam = projects.reduce(
    (total, project) => total + memoryOf(project),
    0
  );

  const counted = {
    projects: t.plural("dashboard.project", projects.length),
    up: up.length,
  };

  const description =
    broken.length > 0
      ? t("dashboard.panel.summaryBroken", {
          ...counted,
          broken: t.plural("dashboard.broken", broken.length),
        })
      : t("dashboard.panel.summary", counted);

  return (
    <Screen
      actions={
        <>
          <Button icon={FolderPlus} onClick={onAddProject} variant="inverse">
            {t("dashboard.panel.newProject")}
          </Button>
          <Button
            disabled={busy !== null}
            icon={Play}
            onClick={() => onAct("project.up", "all")}
          >
            {t("dashboard.panel.startAll")}
          </Button>
          <ConfirmButton
            confirmLabel={t("dashboard.panel.stopAll")}
            disabled={busy !== null}
            icon={Square}
            onConfirm={() => onAct("project.down", "all")}
            question={t("dashboard.panel.stopAllQuestion")}
          >
            {t("dashboard.panel.stopAll")}
          </ConfirmButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <ConfirmButton
            confirmLabel={t("dashboard.panel.reboot")}
            icon={Power}
            onConfirm={onReboot}
            question={t("dashboard.panel.rebootQuestion", {
              name: machineName,
            })}
          >
            {t("dashboard.panel.rebootServer")}
          </ConfirmButton>
        </>
      }
      description={projects.length > 0 ? description : undefined}
      eyebrow={machineName}
      title={t("dashboard.panel.title")}
    >
      {securing && onSecure ? (
        <DashboardRootNotice need={securing} onSecure={onSecure} />
      ) : null}

      <Section
        aside={
          <span className="font-data text-ink-3 text-small">
            {snapshot.machine.os} {snapshot.machine.version} ·{" "}
            {snapshot.machine.arch} ·{" "}
            {t("dashboard.agentVersion", {
              version: snapshot.machine.agent_version,
            })}
          </span>
        }
        name="machine"
        title={t("dashboard.panel.machine")}
      >
        <DashboardMachine
          machine={snapshot.machine}
          onCleanSessions={onCleanSessions}
          onOpenTerminal={onOpenTerminal}
          onStopProject={() => {
            projectsHeading.current?.scrollIntoView({ block: "start" });
            projectsHeading.current?.focus();
          }}
          projectCount={projects.length}
          projectsRam={projectsRam}
          runningProjects={up.length}
        />
      </Section>

      <Section name="services" title={t("dashboard.panel.services")}>
        <DashboardServices
          accounts={accounts}
          onAdd={onAddService}
          onOpen={onOpenService}
          services={snapshot.services}
        />
      </Section>

      <Section
        name="projects"
        ref={projectsHeading}
        title={t("dashboard.panel.projects")}
      >
        {projects.length === 0 ? (
          <Panel inset="none">
            <EmptyState
              action={
                <Button icon={FolderPlus} onClick={onAddProject}>
                  {t("dashboard.panel.newProject")}
                </Button>
              }
              icon={Package}
              title={t("dashboard.panel.noProjects")}
            />
          </Panel>
        ) : (
          <div className="grid gap-gutter md:grid-cols-2">
            {projects.map((project) => (
              <DashboardProjectCard
                busy={busy === project.name || busy === "all"}
                key={project.name}
                onAct={onAct}
                onOpen={onOpenProject}
                project={project}
              />
            ))}
          </div>
        )}
      </Section>

      <ActivitySessions
        attached={attached}
        onClean={onCleanSessions}
        onStop={onStopSession}
        sessions={snapshot.sessions}
      />
    </Screen>
  );
}
