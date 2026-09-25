import { useTranslations } from "@renderer/i18n/use-translations";
import { sshSlug } from "@shared/ssh-names";
import { controlClass, Field, fieldAria } from "../ui/field";

/** A blank field means "drawn from the server name", not "no SSH name". */
export function ServerSshNameField({
  name,
  serverName,
  value,
  problem,
  disabled = false,
  onChange,
}: {
  name: string;
  serverName: string;
  value: string;
  problem?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();

  const sshName = sshSlug(value.trim() || serverName);
  const help = sshName
    ? t("servers.field.sshName.help", { name: sshName })
    : undefined;

  return (
    <Field
      help={help}
      label={t("servers.field.sshName")}
      name={name}
      problem={problem}
    >
      <input
        {...fieldAria({ help: Boolean(help), name, problem: Boolean(problem) })}
        autoComplete="off"
        className={controlClass("data", Boolean(problem))}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={sshSlug(serverName) ?? ""}
        spellCheck={false}
        value={value}
      />
    </Field>
  );
}
