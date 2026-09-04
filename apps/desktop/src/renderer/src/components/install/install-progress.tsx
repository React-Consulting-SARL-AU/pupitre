import type { ModuleProgress } from "../../stores/install";
import { InstallModuleRow } from "./install-module-row";

export function InstallProgress({
  modules,
  nameOf,
}: {
  modules: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
}) {
  return (
    <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      {modules.map((module) => (
        <InstallModuleRow
          key={module.id}
          module={module}
          name={nameOf(module.id)}
        />
      ))}
    </ul>
  );
}
