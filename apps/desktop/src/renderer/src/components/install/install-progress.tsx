import type { ModuleProgress } from "../../stores/install";
import { Panel } from "../ui/panel";
import { InstallModuleRow } from "./install-module-row";
import type { ModuleWording } from "./install-status";

export function InstallProgress({
  modules,
  nameOf,
  wording,
}: {
  modules: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
  wording?: ModuleWording;
}) {
  return (
    <Panel as="ul" list>
      {modules.map((module) => (
        <InstallModuleRow
          key={module.id}
          module={module}
          name={nameOf(module.id)}
          wording={wording}
        />
      ))}
    </Panel>
  );
}
