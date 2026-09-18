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
import { Field } from "../ui/field";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { Select } from "../ui/select";

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
    <Section
      data-runtimes={String(held.length)}
      name="runtimes"
      title={t("project.config.runtimes.title")}
    >
      <Panel className="flex flex-col gap-5" inset="lg">
        <p className="text-[12px] text-ink-3 leading-relaxed">
          {t("project.config.runtimes.help")}
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {held.map(({ service, tool }) => {
            const versions = service.versions ?? [];
            const name = `config.runtimes.${tool}`;

            return (
              <Field key={tool} label={service.name} name={name}>
                <Select
                  id={name}
                  kind="data"
                  name={name}
                  onChange={(version) => onChange(tool, version)}
                  options={[
                    {
                      label: t("project.config.runtimes.default", {
                        version: versions[0] ?? "",
                      }),
                      value: "",
                    },
                    ...versions.map((version) => ({
                      label: version,
                      value: version,
                    })),
                  ]}
                  value={runtimes[tool] ?? ""}
                />
              </Field>
            );
          })}
        </div>
      </Panel>
    </Section>
  );
}
