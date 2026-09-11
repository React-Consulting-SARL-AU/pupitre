import type { Machine } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { decimal, disk, gigabytes, memory, uptime } from "@renderer/lib/format";
import {
  Cpu,
  HardDrive,
  Layers,
  MemoryStick,
  Sparkles,
  Square,
  SquareTerminal,
} from "lucide-react";
import { DashboardStat } from "./dashboard-stat";
import { DashboardStatRemedy } from "./dashboard-stat-remedy";

const BUSY_LOAD = 1;

const LOW_RAM_MB = 1024;

const LOW_DISK_SHARE = 0.9;

/**
 * The four figures that decide whether the machine can take one more thing.
 *
 * They come from `snapshot.machine`, as the agent measured them. There is no
 * processor percentage in the protocol — the load average is what a Unix
 * machine actually reports — so it is the load, divided by the cores, that says
 * whether the machine is keeping up. A figure past its line tints its gauge
 * and says what to do: a project to stop when memory or the processor is
 * short, sessions to clean when the disk is, and a terminal in every case.
 */
export function DashboardMachine({
  machine,
  projectsRam,
  projectCount,
  runningProjects = 0,
  onStopProject,
  onCleanSessions,
  onOpenTerminal,
}: {
  machine: Machine;
  projectsRam: number;
  projectCount: number;
  /** How many projects are up: none, and stopping one is not a remedy. */
  runningProjects?: number;
  /** Takes the reader to the projects, where one is stopped by its own button. */
  onStopProject?: () => void;
  /** Answer with the promise of the cleaning and the button waits on it. */
  onCleanSessions?: () => unknown;
  onOpenTerminal?: () => void;
}) {
  const t = useTranslations();

  const free = machine.ram_total_mb - machine.ram_used_mb;
  const load = machine.load[0];
  const perCore = load / machine.cores;
  const usedDisk = machine.disk_total_gb - machine.disk_free_gb;

  const terminal = onOpenTerminal ? (
    <Button
      icon={SquareTerminal}
      onClick={onOpenTerminal}
      size="sm"
      variant="discreet"
    >
      {t("dashboard.remedy.openTerminal")}
    </Button>
  ) : null;

  const stopProject =
    runningProjects > 0 && onStopProject ? (
      <Button icon={Square} onClick={onStopProject} size="sm">
        {t("dashboard.remedy.stopProject")}
      </Button>
    ) : null;

  const pressure = (name: string, text: string) => (
    <DashboardStatRemedy
      actions={
        <>
          {stopProject}
          {terminal}
        </>
      }
      name={name}
      text={text}
    />
  );

  return (
    <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
      <DashboardStat
        alert={free < LOW_RAM_MB}
        detail={t("dashboard.machine.memoryDetail", { free: gigabytes(free) })}
        icon={MemoryStick}
        remedy={pressure(
          "memory",
          t(
            runningProjects > 0
              ? "dashboard.remedy.memoryProjects"
              : "dashboard.remedy.memory"
          )
        )}
        share={machine.ram_used_mb / machine.ram_total_mb}
        title={t("dashboard.machine.memoryTitle")}
        value={`${gigabytes(machine.ram_used_mb)} / ${gigabytes(machine.ram_total_mb)}`}
      />
      <DashboardStat
        alert={perCore > BUSY_LOAD}
        detail={t("dashboard.machine.loadDetail", {
          cores: machine.cores,
          uptime: uptime(machine.uptime_s),
        })}
        icon={Cpu}
        remedy={pressure(
          "load",
          t(
            runningProjects > 0
              ? "dashboard.remedy.loadProjects"
              : "dashboard.remedy.load"
          )
        )}
        share={Math.min(1, perCore)}
        title={t("dashboard.machine.loadTitle")}
        value={decimal(load, 2)}
      />
      <DashboardStat
        alert={usedDisk / machine.disk_total_gb > LOW_DISK_SHARE}
        detail={t("dashboard.machine.diskDetail", {
          free: disk(machine.disk_free_gb),
        })}
        icon={HardDrive}
        remedy={
          <DashboardStatRemedy
            actions={
              <>
                {onCleanSessions ? (
                  <Button icon={Sparkles} onClick={onCleanSessions} size="sm">
                    {t("dashboard.remedy.cleanSessions")}
                  </Button>
                ) : null}
                {terminal}
              </>
            }
            name="disk"
            text={t("dashboard.remedy.disk")}
          />
        }
        share={usedDisk / machine.disk_total_gb}
        title={t("dashboard.machine.diskTitle")}
        value={`${disk(usedDisk)} / ${disk(machine.disk_total_gb)}`}
      />
      <DashboardStat
        detail={t.plural("dashboard.machine.projectsDeclared", projectCount)}
        icon={Layers}
        title={t("dashboard.machine.projectsTitle")}
        value={memory(projectsRam)}
      />
    </div>
  );
}
