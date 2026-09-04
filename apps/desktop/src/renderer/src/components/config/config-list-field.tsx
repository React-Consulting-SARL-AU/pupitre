import type { ListField } from "@pupitre/shared/catalog";
import { itemKey, type SecretMark } from "@shared/secrets";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import { fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import { ConfigSecretField } from "./config-secret-field";

/**
 * A list of values of one kind, within the bounds the manifest set.
 *
 * A list of `secret` items is a list of secret fields: each element goes to the
 * main process under `<clé>.<rang>` and never comes back, exactly like a lone
 * secret.
 */
export function ConfigListField({
  moduleId,
  field,
  values,
  marks,
  onChange,
  onSecret,
}: {
  moduleId: string;
  field: ListField;
  values: readonly string[];
  marks?: Record<string, SecretMark>;
  onChange?: (next: string[]) => void;
  onSecret?: (key: string, value: string) => void;
}) {
  const least = Math.max(field.min ?? 0, field.required ? 1 : 0);
  const most = field.max ?? Number.POSITIVE_INFINITY;
  const rows = Math.max(values.length, least, 1);
  const items = Array.from({ length: rows }, (_, i) => values[i] ?? "");

  function replace(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange?.(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((value, index) => {
        const key = itemKey(field.key, index);
        const name = `${moduleId}.${key}`;

        return (
          <div className="flex items-start gap-2" data-item={name} key={name}>
            <div className="min-w-0 flex-1">
              {field.items === "secret" ? (
                <ConfigSecretField
                  label={`${field.label} ${index + 1}`}
                  mark={marks?.[key]}
                  name={name}
                  onChange={(next) => onSecret?.(key, next)}
                  required={index < least}
                />
              ) : (
                <input
                  aria-label={`${field.label} ${index + 1}`}
                  className={fieldControlClass}
                  name={name}
                  onChange={(event) => replace(index, event.target.value)}
                  type="text"
                  value={value}
                />
              )}
            </div>

            {items.length > least ? (
              <IconButton
                icon={X}
                label={`Retirer ${field.label} ${index + 1}`}
                onClick={() =>
                  onChange?.(items.filter((_, at) => at !== index))
                }
                variant="discreet"
              />
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        {items.length < most ? (
          <Button
            icon={Plus}
            onClick={() => onChange?.([...items, ""])}
            size="sm"
            variant="discreet"
          >
            Ajouter
          </Button>
        ) : null}

        <span className="font-data text-[10.5px] text-ink-4 tabular-nums">
          {least > 0
            ? `de ${least} à ${field.max ?? "n"} valeurs`
            : `jusqu'à ${field.max ?? "n"} valeurs`}
        </span>
      </div>
    </div>
  );
}
