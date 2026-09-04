import type { Machine } from "@pupitre/shared/agent-protocol/state";
import { disk, gigabytes, memory, uptime } from "@renderer/lib/format";
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
  const free = machine.ram_total_mb - machine.ram_used_mb;
  const load = machine.load[0];
  const perCore = load / machine.cores;
  const usedDisk = machine.disk_total_gb - machine.disk_free_gb;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <DashboardStat
        alert={free < LOW_RAM_MB}
        detail={`${gigabytes(free)} disponibles`}
        icon={MemoryStick}
        share={machine.ram_used_mb / machine.ram_total_mb}
        title="Mémoire"
        value={`${gigabytes(machine.ram_used_mb)} / ${gigabytes(machine.ram_total_mb)}`}
      />
      <DashboardStat
        alert={perCore > BUSY_LOAD}
        detail={`${machine.cores} cœurs · en route depuis ${uptime(machine.uptime_s)}`}
        icon={Cpu}
        share={Math.min(1, perCore)}
        title="Charge"
        value={load.toFixed(2).replace(".", ",")}
      />
      <DashboardStat
        alert={usedDisk / machine.disk_total_gb > LOW_DISK_SHARE}
        detail={`${disk(machine.disk_free_gb)} libres`}
        icon={HardDrive}
        share={usedDisk / machine.disk_total_gb}
        title="Disque"
        value={`${disk(usedDisk)} / ${disk(machine.disk_total_gb)}`}
      />
      <DashboardStat
        detail={`${projectCount} projet${projectCount > 1 ? "s" : ""} déclaré${projectCount > 1 ? "s" : ""}`}
        icon={Layers}
        title="Projets"
        value={memory(projectsRam)}
      />
    </div>
  );
}
