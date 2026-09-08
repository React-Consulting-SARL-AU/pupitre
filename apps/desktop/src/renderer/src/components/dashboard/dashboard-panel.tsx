import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import { ActivitySessions } from "@renderer/components/activity/activity-sessions";
import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Label } from "@renderer/components/ui/label";
import { PageHeader } from "@renderer/components/ui/page-header";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isRunning } from "@renderer/lib/project-state";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { Play, Power, Sparkles, Square } from "lucide-react";
import { DashboardMachine } from "./dashboard-machine";
import { DashboardProjectCard } from "./dashboard-project-card";
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
  busy: string | null;
  /** The sessions the app still has a tab on. */
  attached: readonly string[];
  onOpenProject: (name: string) => void;
  onAct: (action: ProjectAction, name: string) => void;
  onStopSession: (pid: number) => void;
  onCleanSessions: () => void;
  onReboot: () => void;
}

export function DashboardPanel({
  snapshot,
  busy,
  attached,
  onOpenProject,
  onAct,
  onStopSession,
  onCleanSessions,
  onReboot,
}: Props) {
  const t = useTranslations();

  const projects = snapshot.projects;
  const up = projects.filter((project) => isRunning(project.state));
  const broken = projects.filter(
    (project) => project.state === "failed" || project.state === "down"
  );
  const projectsRam = projects.reduce(
    (total, project) => total + (project.ram_mb ?? 0),
    0
  );

  const projectsLabel = t.plural("dashboard.project", projects.length);

  const description =
    broken.length > 0
      ? t("dashboard.panel.summaryBroken", {
          projects: projectsLabel,
          broken: t.plural("dashboard.broken", broken.length),
        })
      : t("dashboard.panel.summary", { projects: projectsLabel });

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <PageHeader
          actions={
            <>
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
            </>
          }
          description={description}
          eyebrow={snapshot.machine.hostname}
          title={t("dashboard.panel.title", {
            projects: t.plural("dashboard.project", up.length),
          })}
        />

        <section className="flex flex-col gap-3">
          <DashboardMachine
            machine={snapshot.machine}
            projectCount={projects.length}
            projectsRam={projectsRam}
          />
          {/* What the machine is and what runs it: information, so it is read
              in an ink that can be, not in the faintest one. */}
          <p className="font-data text-[12px] text-ink-3">
            {snapshot.machine.os} {snapshot.machine.version} ·{" "}
            {snapshot.machine.arch} · pupitred {snapshot.machine.agent_version}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2>
            <Label>{t("dashboard.panel.services")}</Label>
          </h2>
          <DashboardServices services={snapshot.services} />
        </section>

        <section className="flex flex-col gap-3">
          <h2>
            <Label>{t("dashboard.panel.projects")}</Label>
          </h2>
          {projects.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              {t("dashboard.panel.noProjects")}
            </p>
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
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-ink-3">
            <Sparkles size={12} strokeWidth={1.5} />
            <Label>{t("dashboard.panel.backgroundSessions")}</Label>
          </h2>
          <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
            <ActivitySessions
              attached={attached}
              onClean={onCleanSessions}
              onStop={onStopSession}
              sessions={snapshot.sessions}
            />
          </div>
        </section>

        {/*
          Reboot keeps its distance from the rest: it is the only button on this
          page that interrupts everyone, and the only one with no undo.
        */}
        <div className="flex justify-end border-line border-t pt-5">
          <ConfirmButton
            confirmLabel={t("dashboard.panel.reboot")}
            icon={Power}
            onConfirm={onReboot}
            question={t("dashboard.panel.rebootQuestion")}
          >
            {t("dashboard.panel.rebootServer")}
          </ConfirmButton>
        </div>
      </div>
    </div>
  );
}
