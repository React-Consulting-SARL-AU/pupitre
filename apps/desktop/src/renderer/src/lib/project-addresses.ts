import type { Project } from "@pupitre/shared/agent-protocol/state";
import { guardedProcess } from "./process-access";
import { isRunning } from "./project-state";

/** One port of one process, as the overview lists it. */
export interface AddressLine {
  label: string;
  process: string;
  host: string;
  port: number;
  live: boolean;
  hostname?: string;
  /** Null without an access gate. */
  guarded: boolean | null;
}

export function addressLines(
  project: Project,
  mainLabel: string
): AddressLine[] {
  const count = project.processes.length;

  return project.processes.flatMap((process) => {
    const routes =
      process.routes.length > 0
        ? process.routes
        : [{ label: mainLabel, port: process.port }];

    return routes.map((route) => ({
      guarded: guardedProcess(project, process),
      host: process.host,
      label: routeLabel(count, process.id, route.label),
      live: isRunning(process.state),
      port: route.port,
      process: process.id,
      ...("hostname" in route && route.hostname
        ? { hostname: route.hostname }
        : {}),
    }));
  });
}

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
