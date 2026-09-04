import type { Project } from "@shared/contract";
import { StatusPill } from "./StatusPill";
import { Label } from "./ui/label";

function memory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return mb > 0 ? `${mb} MB` : "—";
}

type Props = {
  projects: Project[];
  selection: string | null;
  onSelect: (name: string) => void;
};

export function ProjectList({ projects, selection, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto] gap-3 border-line border-b bg-base px-4 py-2">
        <Label>Project</Label>
        <Label>Memory</Label>
      </div>

      {projects.map((project) => {
        const active = project.name === selection;
        return (
          <button
            className={`clickable border-line border-b px-4 py-2.5 text-left transition-soft ${
              active ? "bg-raised" : "hover:bg-surface"
            }`}
            key={project.name}
            onClick={() => onSelect(project.name)}
            type="button"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-semibold text-ink">
                {project.name}
              </span>
              <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
                {memory(project.ram_mb)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <StatusPill state={project.state} />
              {project.uptime ? (
                <span className="font-data text-[10px] text-ink-3">
                  {project.uptime}
                </span>
              ) : null}
            </div>

            <div className="mt-1 truncate font-data text-[10px] text-ink-3">
              {project.host}:{project.port}
              {project.branch ? ` · ${project.branch}` : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}
