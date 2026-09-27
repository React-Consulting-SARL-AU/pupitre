import { type AccessKey, guards } from "@pupitre/shared/agent-protocol/access";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import type { Translate } from "@renderer/i18n/i18n";

/** The names of a project that answer only to a key: the ones a copied link can point at. */
export function guardedHostnames(project: Project): string[] {
  return project.processes.flatMap((process) =>
    guards(project, process)
      ? process.routes.flatMap((route) => route.hostname ?? [])
      : []
  );
}

export function hostnamesOpenedBy(
  key: AccessKey,
  projects: readonly Project[]
): string[] {
  return projects
    .filter(
      (project) => key.projects === null || key.projects.includes(project.name)
    )
    .flatMap(guardedHostnames);
}

export function scopeLabel(t: Translate, key: AccessKey): string {
  if (key.projects === null) {
    return t("access.key.scope.all");
  }

  const [only] = key.projects;

  return key.projects.length === 1 && only
    ? t("access.key.scope.one", { name: only })
    : t("access.key.scope.many", { count: key.projects.length });
}
