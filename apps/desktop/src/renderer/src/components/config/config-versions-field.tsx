import { defaultVersionOf, type VersionsField } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CheckLine } from "../ui/check-line";

/**
 * The majors a runtime is installed at, one line each, in the order the
 * manifest runs them: newest first. The newest checked is named the default,
 * because that is what the machine does with it. Unchecking the last one is
 * refused by the contract, not by the control: the field is then said to be
 * required under it.
 */
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
  /** Whether the choice is refused: the group is said to be invalid. */
  wrong?: boolean;
  onChange?: (next: string[]) => void;
}) {
  const t = useTranslations();
  const fallback = defaultVersionOf(field, chosen);

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
