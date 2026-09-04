import type { Field } from "@pupitre/shared/catalog";
import { CheckBox } from "../ui/check-box";
import { fieldControlClass } from "../ui/field";

/**
 * The plain kinds — text, number, select, version, boolean — where the value
 * lives in the store and comes straight back to the control.
 */
export function ConfigValueControl({
  name,
  field,
  value,
  onValue,
}: {
  name: string;
  field: Field;
  value: unknown;
  onValue?: (value: unknown) => void;
}) {
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
      <select
        aria-label={field.label}
        className={fieldControlClass}
        name={name}
        onChange={(event) => onValue?.(event.target.value)}
        value={typeof value === "string" ? value : ""}
      >
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "number") {
    return (
      <input
        aria-label={field.label}
        className={fieldControlClass}
        name={name}
        onChange={(event) => onValue?.(event.target.valueAsNumber)}
        required={field.required}
        type="number"
        value={typeof value === "number" ? value : ""}
      />
    );
  }

  if (field.kind === "text") {
    return (
      <input
        aria-label={field.label}
        className={fieldControlClass}
        name={name}
        onChange={(event) => onValue?.(event.target.value)}
        required={field.required}
        type="text"
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  return null;
}
