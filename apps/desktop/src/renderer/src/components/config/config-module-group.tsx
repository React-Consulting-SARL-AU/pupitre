import type { SecretMark } from "@shared/secrets";
import type { FieldGroup } from "../../lib/catalog-selection";
import { ServiceLogo } from "../ui/service-logo";
import { ConfigFieldControl, type FieldHandlers } from "./config-field-control";

/**
 * One module's questions, under its own name and logo.
 *
 * A module with no field still gets its heading: seeing it listed and asked
 * nothing is what tells the reader there is nothing to decide, rather than
 * leaving them looking for a section that is not there.
 */
export function ConfigModuleGroup({
  group,
  values,
  marks,
  handlers,
}: {
  group: FieldGroup;
  values: Record<string, unknown>;
  marks?: Record<string, SecretMark>;
  handlers: FieldHandlers;
}) {
  return (
    <section
      className="elevation-raised flex flex-col gap-4 rounded-md border border-line bg-surface p-5"
      data-group={group.module.id}
    >
      <header className="flex items-center gap-3">
        <ServiceLogo
          moduleId={group.module.id}
          name={group.module.name}
          size={20}
        />
        <div className="min-w-0">
          <h2 className="font-medium text-ink">{group.module.name}</h2>
          <p className="text-[11px] text-ink-3">{group.module.summary}</p>
        </div>
      </header>

      {group.fields.length === 0 ? (
        <p className="text-[11px] text-ink-4">Rien à régler pour ce module.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.map((field) => (
            <ConfigFieldControl
              field={field}
              handlers={handlers}
              key={field.key}
              marks={marks}
              moduleId={group.module.id}
              value={values[field.key]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
