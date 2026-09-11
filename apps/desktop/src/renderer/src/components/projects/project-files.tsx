import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { FileBrowser } from "@renderer/components/files/file-browser";
import { remoteEditors } from "@renderer/lib/modules";

/**
 * The files of one project, from the folder the agent registered for it.
 *
 * `path` is absolute and comes from the agent; the browser puts it back under
 * the root the agent's own completions name, and refuses to guess when the
 * two do not meet.
 */
export function ProjectFiles({
  serverId,
  project,
  services,
  onTerminal,
}: {
  serverId: string;
  project: Project;
  services: readonly Service[];
  /** A shell in a folder of the project, relative to its own. */
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
