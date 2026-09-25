import type { Field } from "@pupitre/shared/catalog";
import { CheckBox } from "../ui/check-box";
import { controlClass, fieldAria } from "../ui/field";
import { Select } from "../ui/select";

// A git identity is prose; ports, paths and versions are data.
const PROSE_KEYS = new Set(["git_name"]);

export function ConfigValueControl({
  name,
  field,
  value,
  wrong = false,
  onValue,
}: {
  name: string;
  field: Field;
  value: unknown;
  wrong?: boolean;
  onValue?: (value: unknown) => void;
}) {
  const kind = PROSE_KEYS.has(field.key) ? "prose" : "data";
  const control = controlClass(kind, wrong);

  const aria = fieldAria({
    help: Boolean(field.help),
    name,
    problem: wrong,
    required: "required" in field && field.required === true,
  });

  if (field.kind === "boolean") {
    return (
      <CheckBox
        checked={value === true}
        label={field.label}
        name={name}
        onChange={(next) => onValue?.(next)}
      />
    );
  }

  if (field.kind === "version" || field.kind === "select") {
    return (
      <Select
        {...aria}
        kind={kind}
        name={name}
        onChange={(next) => onValue?.(next)}
        options={(field.options ?? []).map((option) => ({
          label: option,
          value: option,
        }))}
        value={typeof value === "string" ? value : ""}
        wrong={wrong}
      />
    );
  }

  if (field.kind === "number") {
    return (
      <input
        {...aria}
        className={control}
        max={field.max}
        min={field.min}
        name={name}
        onChange={(event) => onValue?.(event.target.valueAsNumber)}
        type="number"
        value={typeof value === "number" ? value : ""}
      />
    );
  }

  if (field.kind === "text") {
    return (
      <input
        {...aria}
        className={control}
        name={name}
        onChange={(event) => onValue?.(event.target.value)}
        type="text"
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  return null;
}
