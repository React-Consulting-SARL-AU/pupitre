import type { Project } from "@pupitre/shared/agent-protocol/state";
import { isRunning } from "./project-state";

export interface LiveAddress {
  label: string;
  hostname: string;
  url: string;
}

export function routeLabel(
  processCount: number,
  processId: string,
  label: string
): string {
  return processCount > 1 ? `${processId}/${label}` : label;
}

/** A route whose process does not run answers with the tunnel's error page, so it is left out. */
export function liveAddresses(
  project: Pick<Project, "processes">
): LiveAddress[] {
  const count = project.processes.length;

  return project.processes
    .filter((process) => isRunning(process.state))
    .flatMap((process) =>
      process.routes.flatMap((route) =>
        route.hostname
          ? [
              {
                hostname: route.hostname,
                label: routeLabel(count, process.id, route.label),
                url: `https://${route.hostname}`,
              },
            ]
          : []
      )
    );
}
