import type {
  Capabilities,
  GitStatus,
  Machine,
  ProcessInfo,
  Project,
  ServerService,
  Session,
  Snapshot,
  TerminalAgent,
} from "@shared/contract";
import {
  Activity,
  ArrowDownToLine,
  Cpu,
  ExternalLink,
  HardDrive,
  Layers,
  MemoryStick,
  Play,
  Power,
  RotateCw,
  Server,
  Sparkles,
  Square,
  SquareTerminal,
} from "lucide-react";
import { Processes } from "./Processes";
import { CheckButton, Repos } from "./Repos";
import { Sessions } from "./Sessions";
import { StatusPill } from "./StatusPill";

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(mb >= 10_240 ? 0 : 1)} GB`;
}

function memory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return mb > 0 ? `${mb} MB` : "—";
}

/** A horizontal gauge. The colour says nothing the bar does not say already. */
function Gauge({ share, alert }: { share: number; alert?: boolean }) {
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${alert ? "bg-warn" : "bg-accent"}`}
        style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
      />
    </div>
  );
}

function Stat({
  title,
  value,
  detail,
  share,
  alert,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  share?: number;
  alert?: boolean;
  icon: typeof Cpu;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 transition-soft hover:border-line-strong">
      <p className="flex items-center gap-1.5 font-mono text-[10px] text-ink-4 uppercase tracking-[0.09em]">
        <Icon size={12} strokeWidth={2} />
        {title}
      </p>
      <p className="mt-1.5 font-semibold text-xl tabular-nums tracking-tight">
        {value}
      </p>
      <p className="font-mono text-[11px] text-ink-4">{detail}</p>
      {share === undefined ? null : <Gauge alert={alert} share={share} />}
    </div>
  );
}

type Props = {
  snapshot: Snapshot;
  /** Null until the machine has answered: we then only show what is certain. */
  capabilities: Capabilities | null;
  processes: ProcessInfo[];
  sessions: Session[];
  onStopSession: (pid: number) => void;
  onStopProcess: (pid: number, what: string) => void;
  onCleanSessions: () => void;
  onReboot: () => void;
  cpuPercent: number | null;
  busy: string | null;
  onSelect: (name: string) => void;
  onAct: (action: "up" | "down" | "restart", project: string) => void;
  onTerminal: (project: string | null, kind: "shell" | TerminalAgent) => void;
  onAll: (action: "up" | "down") => void;
  /** Each project's gap with its repository, by project name. */
  git: Record<string, GitStatus>;
  gitBusy: boolean;
  gitCheckedAt: number | null;
  onCheckGit: () => void;
  onPull: (project: string) => void;
  onPullAll: () => void;
};

export function Dashboard({
  snapshot,
  capabilities,
  processes,
  sessions,
  onStopSession,
  onStopProcess,
  onCleanSessions,
  onReboot,
  cpuPercent,
  busy,
  onSelect,
  onAct,
  onTerminal,
  onAll,
  git,
  gitBusy,
  gitCheckedAt,
  onCheckGit,
  onPull,
  onPullAll,
}: Props) {
  const machine: Machine = snapshot.machine;
  const projects = snapshot.projects;
  const up = projects.filter(
    (p) =>
      p.state === "online" || p.state === "service" || p.state === "external"
  );
  const broken = projects.filter(
    (p) => p.state === "failed" || p.state === "down"
  );
  const projectsRam = projects.reduce((total, p) => total + p.ram_mb, 0);
  const services: ServerService[] = snapshot.services ?? [];
  const serverAgent = capabilities?.agents[0] ?? null;

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-semibold text-xl tracking-tight">
              {up.length} service{up.length > 1 ? "s" : ""} online
            </h1>
            <p className="mt-0.5 text-ink-3">
              of {projects.length} · server up for {machine.uptime_hours} h
              {broken.length > 0 ? ` · ${broken.length} failing` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[12px] transition-soft hover:border-accent hover:text-accent-strong"
              onClick={() => onAll("up")}
              type="button"
            >
              <Play size={13} strokeWidth={2} />
              Start all
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[12px] transition-soft hover:border-danger hover:text-danger"
              onClick={() => onAll("down")}
              type="button"
            >
              <Square size={13} strokeWidth={2} />
              Stop all
            </button>
          </div>
        </div>

        <Repos
          busy={gitBusy}
          busyProject={busy}
          git={git}
          onPull={onPull}
          onPullAll={onPullAll}
          onSelect={onSelect}
        />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            alert={machine.ram_free_mb < 4096}
            detail={`${gb(machine.ram_free_mb)} available`}
            icon={MemoryStick}
            share={machine.ram_used_mb / machine.ram_total_mb}
            title="Memory"
            value={`${gb(machine.ram_used_mb)} / ${gb(machine.ram_total_mb)}`}
          />
          <Stat
            alert={(cpuPercent ?? 0) > 80}
            detail={`load ${machine.load} · ${machine.cores} cores`}
            icon={Cpu}
            share={cpuPercent === null ? undefined : cpuPercent / 100}
            title="Processor"
            value={cpuPercent === null ? "—" : `${cpuPercent.toFixed(0)} %`}
          />
          <Stat
            detail={`${gb(machine.disk_free_mb)} free`}
            icon={HardDrive}
            share={1 - machine.disk_free_mb / machine.disk_total_mb}
            title="Disk"
            value={gb(machine.disk_total_mb - machine.disk_free_mb)}
          />
          <Stat
            detail={
              services.length > 0
                ? services.map((s) => `${s.label} ${s.state}`).join(" · ")
                : `${projects.length} tracked`
            }
            icon={Layers}
            title="Projects"
            value={memory(projectsRam)}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 font-semibold text-[12px] text-base transition-soft hover:bg-accent-strong"
            onClick={() => onTerminal(null, "shell")}
            type="button"
          >
            <Server size={13} strokeWidth={2} />
            Terminal on the server
          </button>
          {serverAgent ? (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-line-strong px-3.5 py-2 text-[12px] transition-soft hover:border-accent hover:text-accent-strong"
              onClick={() => onTerminal(null, serverAgent)}
              type="button"
            >
              <Sparkles size={13} strokeWidth={2} />
              {serverAgent === "codex" ? "Codex" : "Claude"} on the server
            </button>
          ) : null}

          {/*
            Reboot keeps its distance from the rest: it is the only button on
            this page that interrupts everyone, and the only one with no undo.
          */}
          <button
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[12px] text-ink-4 transition-soft hover:border-danger hover:text-danger"
            onClick={onReboot}
            title="Stops every project and reboots the machine"
            type="button"
          >
            <Power size={13} strokeWidth={2} />
            Reboot the server
          </button>
        </div>

        {capabilities?.processes === false ? null : (
          <>
            <h2 className="mt-8 mb-3 flex items-center gap-1.5 font-mono text-[10px] text-ink-4 uppercase tracking-[0.09em]">
              <Activity size={12} /> What weighs
            </h2>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <Processes list={processes} onStop={onStopProcess} />
            </div>
          </>
        )}

        {capabilities?.sessions === false ? null : (
          <>
            <h2 className="mt-8 mb-3 flex items-center gap-1.5 font-mono text-[10px] text-ink-4 uppercase tracking-[0.09em]">
              <Sparkles size={12} /> Background sessions
            </h2>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <Sessions
                list={sessions}
                onClean={onCleanSessions}
                onStop={onStopSession}
              />
            </div>
          </>
        )}

        <div className="mt-8 mb-3 flex items-center justify-between gap-3">
          <h2 className="font-mono text-[10px] text-ink-4 uppercase tracking-[0.09em]">
            Projects
          </h2>
          <CheckButton
            busy={gitBusy}
            checkedAt={gitCheckedAt}
            onCheck={onCheckGit}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <Card
              agent={serverAgent}
              busy={busy === project.name}
              key={project.name}
              onAct={onAct}
              onPull={onPull}
              onSelect={onSelect}
              onTerminal={onTerminal}
              project={project}
              status={git[project.name] ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({
  project,
  busy,
  agent,
  status,
  onSelect,
  onAct,
  onTerminal,
  onPull,
}: {
  project: Project;
  busy: boolean;
  agent: TerminalAgent | null;
  status: GitStatus | null;
  onSelect: (name: string) => void;
  onAct: (action: "up" | "down" | "restart", project: string) => void;
  onTerminal: (project: string | null, kind: "shell" | TerminalAgent) => void;
  onPull: (project: string) => void;
}) {
  const running =
    project.state === "online" ||
    project.state === "service" ||
    project.state === "external";

  return (
    <div className="rounded-xl border border-line bg-surface p-4 transition-soft hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <button
          className="min-w-0 text-left"
          onClick={() => onSelect(project.name)}
          type="button"
        >
          <p className="flex items-center gap-2 truncate font-semibold hover:text-accent-strong">
            {project.name}
            {status && status.behind > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-veil px-1.5 py-px font-mono text-[10px] text-accent-strong">
                <ArrowDownToLine size={10} />
                {status.behind}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-ink-4">
            {project.host}:{project.port}
            {project.branch ? ` · ${project.branch}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill state={project.state} />
          <span className="font-mono text-[10px] text-ink-4 tabular-nums">
            {project.uptime || "—"}
            {project.ram_mb ? ` · ${memory(project.ram_mb)}` : ""}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {status && status.behind > 0 ? (
          <Mini
            disabled={busy}
            icon={ArrowDownToLine}
            onClick={() => onPull(project.name)}
          >
            Pull
          </Mini>
        ) : null}
        <Mini
          disabled={busy}
          icon={running ? RotateCw : Play}
          onClick={() => onAct(running ? "restart" : "up", project.name)}
        >
          {running ? "Restart" : "Start"}
        </Mini>
        {running ? (
          <Mini
            disabled={busy}
            icon={Square}
            onClick={() => onAct("down", project.name)}
          >
            Stop
          </Mini>
        ) : null}
        <Mini
          icon={SquareTerminal}
          onClick={() => onTerminal(project.name, "shell")}
        >
          Terminal
        </Mini>
        {agent ? (
          <Mini icon={Sparkles} onClick={() => onTerminal(project.name, agent)}>
            {agent === "codex" ? "Codex" : "Claude"}
          </Mini>
        ) : null}
        {project.url ? (
          <Mini
            icon={ExternalLink}
            onClick={() => window.pupitre.openUrl(project.url)}
          >
            Open
          </Mini>
        ) : null}
      </div>
    </div>
  );
}

function Mini({
  children,
  onClick,
  disabled,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: typeof Cpu;
}) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-2 transition-soft hover:border-accent hover:text-accent-strong disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon size={12} strokeWidth={2} />
      {children}
    </button>
  );
}
