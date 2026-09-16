import type {
  ProjectRuntimes as Pins,
  Service,
} from "@pupitre/shared/agent-protocol/state";
import {
  RUNTIME_TOOLS,
  type RuntimeTool,
  runtimeModuleId,
} from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Field, fieldControlClass } from "../ui/field";
import { Label } from "../ui/label";

/**
 * One select per runtime the server holds, in the catalogue's order: the
 * machine's default first, named, then each major installed. A server
 * without a runtime shows nothing of it — there is nothing to pin.
 */
export function ProjectRuntimes({
  services,
  runtimes,
  onChange,
}: {
  services: readonly Service[];
  runtimes: Pins;
  onChange: (tool: RuntimeTool, version: string) => void;
}) {
  const t = useTranslations();

  const held = RUNTIME_TOOLS.flatMap((tool) => {
    const service = services.find(
      (candidate) => candidate.id === runtimeModuleId(tool)
    );

    return service?.versions?.length ? [{ service, tool }] : [];
  });

  if (held.length === 0) {
    return null;
  }

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      data-runtimes={held.length}
    >
      <legend className="flex flex-col gap-1">
        <Label>{t("project.config.runtimes.title")}</Label>
        <span className="text-[12px] text-ink-3 leading-relaxed">
          {t("project.config.runtimes.help")}
        </span>
      </legend>

      <div className="grid gap-3 sm:grid-cols-2">
        {held.map(({ service, tool }) => {
          const versions = service.versions ?? [];
          const name = `config.runtimes.${tool}`;

          return (
            <Field key={tool} label={service.name} name={name}>
              <select
                className={fieldControlClass}
                id={name}
                name={name}
                onChange={(event) => onChange(tool, event.target.value)}
                value={runtimes[tool] ?? ""}
              >
                <option value="">
                  {t("project.config.runtimes.default", {
                    version: versions[0] ?? "",
                  })}
                </option>
                {versions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
