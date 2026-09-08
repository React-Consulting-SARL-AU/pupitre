import type { Machine } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { decimal, disk, gigabytes, memory, uptime } from "@renderer/lib/format";
import { Cpu, HardDrive, Layers, MemoryStick } from "lucide-react";
import { DashboardStat } from "./dashboard-stat";

const BUSY_LOAD = 1;

const LOW_RAM_MB = 1024;

const LOW_DISK_SHARE = 0.9;

/**
 * The four figures that decide whether the machine can take one more thing.
 *
 * They come from `snapshot.machine`, as the agent measured them. There is no
 * processor percentage in the protocol — the load average is what a Unix
 * machine actually reports — so it is the load, divided by the cores, that says
 * whether the machine is keeping up.
 */
export function DashboardMachine({
  machine,
  projectsRam,
  projectCount,
}: {
  machine: Machine;
  projectsRam: number;
  projectCount: number;
}) {
  const t = useTranslations();

  const free = machine.ram_total_mb - machine.ram_used_mb;
  const load = machine.load[0];
  const perCore = load / machine.cores;
  const usedDisk = machine.disk_total_gb - machine.disk_free_gb;

  return (
    <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
      <DashboardStat
        alert={free < LOW_RAM_MB}
        detail={t("dashboard.machine.memoryDetail", { free: gigabytes(free) })}
        icon={MemoryStick}
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
