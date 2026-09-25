import { useTranslations } from "@renderer/i18n/use-translations";
import { controlClass, Field, fieldAria } from "../ui/field";

const NAME = "servers.add.password";

export function ServerAddPasswordField({
  value,
  problem,
  onChange,
}: {
  value: string;
  problem?: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();

  return (
    <Field
      help={t("servers.add.password.help")}
      label={t("servers.add.password.label")}
      name={NAME}
      problem={problem}
      required
    >
      <input
        {...fieldAria({
          help: true,
          name: NAME,
          problem: Boolean(problem),
          required: true,
        })}
        autoComplete="off"
        autoFocus
        className={controlClass("data", Boolean(problem))}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        value={value}
      />
    </Field>
  );
}
