import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import { ActivitySessions } from "@renderer/components/activity/activity-sessions";
import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Label } from "@renderer/components/ui/label";
import { PageHeader } from "@renderer/components/ui/page-header";
import { plural } from "@renderer/lib/format";
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
  onOpenProject: (name: string) => void;
  onAct: (action: ProjectAction, name: string) => void;
  onStopSession: (pid: number) => void;
  onCleanSessions: () => void;
  onReboot: () => void;
}

export function DashboardPanel({
  snapshot,
  busy,
  onOpenProject,
  onAct,
  onStopSession,
  onCleanSessions,
  onReboot,
}: Props) {
  const projects = snapshot.projects;
  const up = projects.filter((project) => isRunning(project.state));
  const broken = projects.filter(
    (project) => project.state === "failed" || project.state === "down"
  );
  const projectsRam = projects.reduce(
    (total, project) => total + (project.ram_mb ?? 0),
    0
  );

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
                Tout démarrer
              </Button>
              <ConfirmButton
                confirmLabel="Tout arrêter"
                disabled={busy !== null}
                icon={Square}
                onConfirm={() => onAct("project.down", "all")}
                question="Chaque projet en cours s'arrête."
              >
                Tout arrêter
              </ConfirmButton>
            </>
          }
          description={`sur ${plural(projects.length, "projet")}${
            broken.length > 0 ? ` · ${plural(broken.length, "en échec")}` : ""
          }`}
          eyebrow={snapshot.machine.hostname}
          title={`${plural(up.length, "projet")} en ligne`}
        />

        <section className="flex flex-col gap-3">
          <DashboardMachine
            machine={snapshot.machine}
            projectCount={projects.length}
            projectsRam={projectsRam}
          />
          <p className="font-data text-[11px] text-ink-4">
            {snapshot.machine.os} {snapshot.machine.version} ·{" "}
            {snapshot.machine.arch} · pupitred {snapshot.machine.agent_version}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2>
            <Label>Services</Label>
          </h2>
          <DashboardServices services={snapshot.services} />
        </section>

        <section className="flex flex-col gap-3">
          <h2>
            <Label>Projets</Label>
          </h2>
          {projects.length === 0 ? (
            <p className="text-[12px] text-ink-3">
              Ce serveur n'a encore déclaré aucun projet.
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
            <Label>Sessions en arrière-plan</Label>
          </h2>
          <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
            <ActivitySessions
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
            confirmLabel="Redémarrer"
            icon={Power}
            onConfirm={onReboot}
            question="Tout s'arrête ; la machine revient en une minute environ."
          >
            Redémarrer le serveur
          </ConfirmButton>
        </div>
      </div>
    </div>
  );
}
