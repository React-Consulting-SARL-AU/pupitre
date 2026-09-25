import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { FileBrowser } from "@renderer/components/files/file-browser";
import { remoteEditors } from "@renderer/lib/modules";

export function ProjectFiles({
  serverId,
  project,
  services,
  onTerminal,
}: {
  serverId: string;
  project: Project;
  services: readonly Service[];
  /** `dir` is relative to the project folder. */
  onTerminal: (dir: string) => void;
}) {
  return (
    <FileBrowser
      editors={remoteEditors(services)}
      onTerminal={onTerminal}
      root={project.path}
      rootLabel={project.name}
      serverId={serverId}
    />
  );
}
