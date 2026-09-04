import { useTranslations } from "@renderer/i18n/use-translations";
import type { SecretMarks } from "@shared/secrets";
import type { FieldGroup } from "../../lib/catalog-selection";
import { fieldControlClass } from "../ui/field";
import { Label } from "../ui/label";
import type { FieldHandlers } from "./config-field-control";
import { ConfigModuleGroup } from "./config-module-group";

/**
 * The configuration, generated from the manifests of the chosen modules.
 *
 * Only one question is the app's own — the name it gives this machine, which no
 * agent knows about. Everything else, the time zone and the git identity of
 * `core.system` included, is a field of a manifest, so a module that arrives
 * with new questions is asked them without a rebuild.
 */
export function ConfigForm({
  groups,
  values,
  secrets,
  machineName,
  onMachineName,
  handlersFor,
}: {
  groups: readonly FieldGroup[];
  values: Record<string, Record<string, unknown>>;
  secrets: SecretMarks;
  machineName: string;
  onMachineName?: (name: string) => void;
  handlersFor?: (moduleId: string) => FieldHandlers;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-gutter">
      <section className="elevation-raised flex flex-col gap-gutter rounded-md border border-line bg-surface p-5">
        <header className="min-w-0">
          <h2 className="font-medium text-ink">{t("config.machine.title")}</h2>
          <p className="text-[11px] text-ink-3">{t("config.machine.help")}</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div
            className="flex min-w-0 flex-col gap-1.5"
            data-field="machine.name"
          >
            <Label>{t("config.machine.nameLabel")}</Label>
            <input
              aria-label={t("config.machine.nameLabel")}
              className={fieldControlClass}
              name="machine.name"
              onChange={(event) => onMachineName?.(event.target.value)}
              type="text"
              value={machineName}
            />
          </div>
        </div>
      </section>

      {groups.map((group) => (
        <ConfigModuleGroup
          group={group}
          handlers={handlersFor?.(group.module.id) ?? {}}
          key={group.module.id}
          marks={secrets[group.module.id]}
          values={values[group.module.id] ?? {}}
        />
      ))}
    </div>
  );
}
