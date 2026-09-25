import type { Field } from "@pupitre/shared/catalog";
import type { SecretMark } from "@shared/secrets";
import type { ReactNode } from "react";
import { Field as FieldFrame } from "../ui/field";
import { ConfigListField } from "./config-list-field";
import { ConfigSecretField } from "./config-secret-field";
import { ConfigValueControl } from "./config-value-control";
import { ConfigVersionsField } from "./config-versions-field";

export interface FieldHandlers {
  onValue?: (key: string, value: unknown) => void;
  onSecret?: (key: string, value: string) => void;
  onGenerate?: (key: string) => void;
  onReveal?: (key: string) => Promise<string | null>;
}

interface ControlProps {
  moduleId: string;
  field: Field;
  value: unknown;
  marks?: Record<string, SecretMark>;
  held?: readonly string[];
  problem?: string;
  handlers: FieldHandlers;
}

// A version always has a value (the runtime's at least) and a checkbox never needs one.
export function isRequired(field: Field): boolean {
  if (field.kind === "version" || field.kind === "versions") {
    return true;
  }

  return field.kind === "boolean" ? false : field.required;
}

function control({
  moduleId,
  field,
  value,
  marks,
  held,
  problem,
  handlers,
}: ControlProps): ReactNode {
  const name = `${moduleId}.${field.key}`;
  const wrong = Boolean(problem);

  if (field.kind === "secret") {
    return (
      <ConfigSecretField
        held={held?.includes(field.key)}
        label={field.label}
        mark={marks?.[field.key]}
        name={name}
        onChange={(next) => handlers.onSecret?.(field.key, next)}
        onGenerate={
          field.generate ? () => handlers.onGenerate?.(field.key) : undefined
        }
        onReveal={() => handlers.onReveal?.(field.key) ?? Promise.resolve(null)}
        required={field.required}
        wrong={wrong}
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
        wrong={wrong}
      />
    );
  }

  if (field.kind === "versions") {
    return (
      <ConfigVersionsField
        chosen={Array.isArray(value) ? (value as string[]) : []}
        field={field}
        name={name}
        onChange={(next) => handlers.onValue?.(field.key, next)}
        wrong={wrong}
      />
    );
  }

  return (
    <ConfigValueControl
      field={field}
      name={name}
      onValue={(next) => handlers.onValue?.(field.key, next)}
      value={value}
      wrong={wrong}
    />
  );
}

export function ConfigFieldControl(props: ControlProps) {
  const { moduleId, field, marks, problem } = props;
  const mark = marks?.[field.key];

  return (
    <div
      data-field={`${moduleId}.${field.key}`}
      data-generated={mark?.generated ? "true" : undefined}
      data-items={field.kind === "list" ? field.items : undefined}
      data-kind={field.kind}
      data-required={isRequired(field) ? "true" : "false"}
      data-revealed={mark?.revealed ? "true" : undefined}
    >
      <FieldFrame
        help={field.help}
        hint={field.hint}
        label={field.label}
        name={`${moduleId}.${field.key}`}
        problem={problem}
        required={isRequired(field)}
      >
        {control(props)}
      </FieldFrame>
    </div>
  );
}
