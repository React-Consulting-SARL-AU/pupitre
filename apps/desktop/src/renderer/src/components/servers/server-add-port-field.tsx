import { useTranslations } from "@renderer/i18n/use-translations";
import { controlClass, Field, fieldAria } from "../ui/field";

const NAME = "servers.add.port";

export function ServerAddPortField({
  value,
  placeholder,
  problem,
  onChange,
}: {
  value: string;
  placeholder: string;
  problem?: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();

  return (
    <Field
      help={t("servers.add.port.help")}
      label={t("servers.add.port.label")}
      name={NAME}
      problem={problem}
    >
      <input
        {...fieldAria({ help: true, name: NAME, problem: Boolean(problem) })}
        className={controlClass("data", Boolean(problem))}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </Field>
  );
}
