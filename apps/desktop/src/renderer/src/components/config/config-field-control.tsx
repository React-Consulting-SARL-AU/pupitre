import type { Field } from "@pupitre/shared/catalog";
import type { SecretMark } from "@shared/secrets";
import type { ReactNode } from "react";
import { Label } from "../ui/label";
import { ConfigListField } from "./config-list-field";
import { ConfigSecretField } from "./config-secret-field";
import { ConfigValueControl } from "./config-value-control";

/**
 * One field of a manifest, drawn according to its kind and nothing else.
 *
 * Every kind of the contract has a control; a manifest that declares a kind
 * this build does not know renders its caption and no input, which is what a
 * new kind's task will come to fill.
 */

export type FieldHandlers = {
  onValue?: (key: string, value: unknown) => void;
  onSecret?: (key: string, value: string) => void;
  onGenerate?: (key: string) => void;
  onReveal?: (key: string) => Promise<string | null>;
};

type ControlProps = {
  moduleId: string;
  field: Field;
  value: unknown;
  marks?: Record<string, SecretMark>;
  handlers: FieldHandlers;
};

/** A version always has one, a checkbox never; the rest say so themselves. */
function isRequired(field: Field): boolean {
  if (field.kind === "version") {
    return true;
  }

  return field.kind === "boolean" ? false : field.required;
}

function control({
  moduleId,
  field,
  value,
  marks,
  handlers,
}: ControlProps): ReactNode {
  const name = `${moduleId}.${field.key}`;

  if (field.kind === "secret") {
    return (
      <ConfigSecretField
        label={field.label}
        mark={marks?.[field.key]}
        name={name}
        onChange={(next) => handlers.onSecret?.(field.key, next)}
        onGenerate={
          field.generate ? () => handlers.onGenerate?.(field.key) : undefined
        }
        onReveal={() => handlers.onReveal?.(field.key) ?? Promise.resolve(null)}
        required={field.required}
      />
    );
  }

  if (field.kind === "list") {
    return (
      <ConfigListField
        field={field}
        marks={marks}
        moduleId={moduleId}
        onChange={(next) => handlers.onValue?.(field.key, next)}
        onSecret={handlers.onSecret}
        values={Array.isArray(value) ? (value as string[]) : []}
      />
    );
  }

  return (
    <ConfigValueControl
      field={field}
      name={name}
      onValue={(next) => handlers.onValue?.(field.key, next)}
      value={value}
    />
  );
}

export function ConfigFieldControl(props: ControlProps) {
  const { moduleId, field, marks } = props;
  const mark = marks?.[field.key];

  return (
    <div
      className="flex min-w-0 flex-col gap-1.5"
      data-field={`${moduleId}.${field.key}`}
      data-generated={mark?.generated ? "true" : undefined}
      data-items={field.kind === "list" ? field.items : undefined}
      data-kind={field.kind}
      data-required={isRequired(field) ? "true" : "false"}
      data-revealed={mark?.revealed ? "true" : undefined}
    >
      <Label>{field.label}</Label>

      {control(props)}

      {field.kind !== "version" && field.help ? (
        <span className="text-[11px] text-ink-3">{field.help}</span>
      ) : null}
    </div>
  );
}
