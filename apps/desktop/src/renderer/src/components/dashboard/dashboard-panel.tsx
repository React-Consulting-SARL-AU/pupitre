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

/**
 * The state of the machine in one page: services, projects, memory, disk,
 * sessions.
 *
 * Everything drawn here comes from a single `snapshot`, so the page costs one
 * command however many projects the machine holds. It takes it as a prop rather
 * than reading the store, which is what lets it be rendered from a fixture.
 */

interface Props {
  snapshot: SnapshotResult;
  /** The name the app gives the server; the machine's own when it has none. */
  serverName?: string;
  busy: string | null;
  /** The sessions the app still has a tab on. */
  attached: readonly string[];
  /** Whose account each service works as, for those that work as somebody. */
  accounts?: Readonly<Record<string, LoginState>>;
  onOpenProject: (name: string) => void;
  onAddProject: () => void;
  onAct: Gesture<[ProjectAction, string]>;
  onStopSession: (pid: number) => void;
  /** Answer with the promise of the cleaning and the button waits on it. */
  onCleanSessions: () => unknown;
  onReboot: () => void;
  onOpenService?: (moduleId: string) => void;
  onOpenTerminal?: () => void;
  /** Root access stayed open, or dev still becomes root without a password: the securing is offered again. */
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
  onOpenTerminal,
  securing = null,
  onSecure,
}: Props) {
  const t = useTranslations();

  const projectsHeading = useRef<HTMLHeadingElement | null>(null);

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
          <ConfirmButton
            confirmLabel={t("dashboard.panel.reboot")}
            icon={Power}
            onConfirm={onReboot}
            question={t("dashboard.panel.rebootQuestion")}
          >
            {t("dashboard.panel.rebootServer")}
          </ConfirmButton>
        </>
      }
      description={projects.length > 0 ? description : undefined}
      eyebrow={serverName ?? snapshot.machine.hostname}
      title={t("dashboard.panel.title")}
    >
      {securing && onSecure ? (
        <DashboardRootNotice need={securing} onSecure={onSecure} />
      ) : null}

      <Section
        aside={
          <span className="font-data text-[12px] text-ink-3">
            {snapshot.machine.os} {snapshot.machine.version} ·{" "}
            {snapshot.machine.arch} · pupitred {snapshot.machine.agent_version}
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
