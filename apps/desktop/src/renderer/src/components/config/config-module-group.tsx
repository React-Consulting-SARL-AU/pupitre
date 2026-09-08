import { useTranslations } from "@renderer/i18n/use-translations";
import type { FieldProblemView } from "@renderer/lib/catalog-selection";
import type { SecretMark } from "@shared/secrets";
import type { ReactNode } from "react";
import type { FieldGroup } from "../../lib/catalog-selection";
import { ServiceLogo } from "../ui/service-logo";
import { ConfigFieldControl, type FieldHandlers } from "./config-field-control";

/**
 * One module's questions, under its own name and logo.
 *
 * A module with no field still gets its heading: seeing it listed and asked
 * nothing is what tells the reader there is nothing to decide, rather than
 * leaving them looking for a section that is not there. What a module needs
 * before its own questions — an account it publishes through — is said above
 * them, because being asked for a domain without it helps nobody.
 */
export function ConfigModuleGroup({
  group,
  values,
  marks,
  problems,
  before,
  handlers,
}: {
  group: FieldGroup;
  values: Record<string, unknown>;
  marks?: Record<string, SecretMark>;
  /** What this module gets wrong, already filtered to what may be shown. */
  problems: readonly FieldProblemView[];
  /** The connection this module declares, when it declares one. */
  before?: ReactNode;
  handlers: FieldHandlers;
}) {
  const t = useTranslations();

  function problemOf(key: string): string | undefined {
    return problems.find((one) => one.field === key)?.message;
  }

  return (
    <section
      aria-labelledby={`group-${group.module.id}`}
      className="elevation-raised flex scroll-mt-4 flex-col gap-gutter rounded-md border border-line bg-surface p-5"
      data-group={group.module.id}
      id={`config-${group.module.id}`}
    >
      <header className="flex items-center gap-3">
        <ServiceLogo
          moduleId={group.module.id}
          name={group.module.name}
          size={20}
        />
        <div className="min-w-0">
          <h2 className="font-medium text-ink" id={`group-${group.module.id}`}>
            {group.module.name}
          </h2>
          <p className="text-[12px] text-ink-3">{group.module.summary}</p>
        </div>
      </header>

      {before}

      {group.fields.length === 0 ? (
        <p className="text-[12px] text-ink-4">{t("config.module.nothing")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.map((field) => (
            <ConfigFieldControl
              field={field}
              handlers={handlers}
              key={field.key}
              marks={marks}
              moduleId={group.module.id}
              problem={problemOf(field.key)}
              value={values[field.key]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
