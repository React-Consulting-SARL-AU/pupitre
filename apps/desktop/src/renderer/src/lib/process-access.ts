import type { ProjectUpdateParams } from "@pupitre/shared/agent-protocol/projects";
import type { Process, Project } from "@pupitre/shared/agent-protocol/state";
import {
  type ProcessAccess,
  processesFromProject,
  processPatches,
} from "./project-processes";

/** Null from an agent without an access gate: nothing to turn over. */
export function guardedProcess(
  project: Project,
  process: Process
): boolean | null {
  if (project.protected === undefined) {
    return null;
  }

  return process.protected ?? project.protected;
}

/** The same patch the configuration screen would send, with only this process's access turned over. */
export function accessTurned(
  project: Project,
  processId: string
): ProjectUpdateParams | null {
  const process = project.processes.find((held) => held.id === processId);
  const guarded = process ? guardedProcess(project, process) : null;

  if (guarded === null) {
    return null;
  }

  let access: ProcessAccess = guarded ? "public" : "protected";

  if (!guarded === project.protected) {
    access = "project";
  }

  const drafts = processesFromProject(project).map((draft) =>
    draft.id === processId ? { ...draft, access } : draft
  );

  return {
    name: project.name,
    patch: { processes: processPatches(drafts, true) },
  };
}
