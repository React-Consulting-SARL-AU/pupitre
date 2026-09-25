import { defaultVersionOf, type VersionsField } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CheckLine } from "../ui/check-line";

export function ConfigVersionsField({
  name,
  field,
  chosen,
  wrong = false,
  onChange,
}: {
  name: string;
  field: VersionsField;
  chosen: readonly string[];
  wrong?: boolean;
  onChange?: (next: string[]) => void;
}) {
  const t = useTranslations();

  const fallback = defaultVersionOf(field, chosen);

  // Unchecking the last version is refused by the contract, not by the control.
  function toggle(version: string, checked: boolean) {
    const next = field.options.filter((option) =>
      option === version ? checked : chosen.includes(option)
    );

    onChange?.(next);
  }

  return (
    <fieldset
      aria-invalid={wrong ? true : undefined}
      className={`flex flex-col gap-2 font-data ${wrong ? "text-danger" : ""}`}
      data-default={fallback}
      name={name}
    >
      {field.options.map((version) => (
        <CheckLine
          checked={chosen.includes(version)}
          key={version}
          label={
            version === fallback
              ? t("config.versions.default", { version })
              : version
          }
          name={`${name}.${version}`}
          onChange={(checked) => toggle(version, checked)}
        />
      ))}
    </fieldset>
  );
}
