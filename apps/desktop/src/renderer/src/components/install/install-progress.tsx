import type { ModuleProgress } from "../../stores/install";
import { Panel } from "../ui/panel";
import { InstallModuleRow } from "./install-module-row";

export function InstallProgress({
  modules,
  nameOf,
}: {
  modules: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
}) {
  return (
    <Panel as="ul" list>
      {modules.map((module) => (
        <InstallModuleRow
          key={module.id}
          module={module}
          name={nameOf(module.id)}
        />
      ))}
    </Panel>
  );
}
