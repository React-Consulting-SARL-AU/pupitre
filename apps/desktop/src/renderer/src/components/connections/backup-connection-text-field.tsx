import type { FieldHint } from "@pupitre/shared/catalog";
import {
  controlClass,
  Field,
  type FieldText,
  fieldAria,
} from "@renderer/components/ui/field";

export function BackupConnectionTextField({
  name,
  label,
  help,
  hint,
  problem,
  value,
  kind = "data",
  secret = false,
  onChange,
}: {
  name: string;
  label: string;
  help?: string;
  hint?: FieldHint;
  problem?: string;
  value: string;
  kind?: FieldText;
  secret?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      help={help}
      hint={hint}
      label={label}
      name={name}
      problem={problem}
      required
    >
      <input
        autoComplete="off"
        className={controlClass(kind, Boolean(problem))}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        type={secret ? "password" : "text"}
        value={value}
        {...fieldAria({
          help: Boolean(help),
          name,
          problem: Boolean(problem),
          required: true,
        })}
      />
    </Field>
  );
}
