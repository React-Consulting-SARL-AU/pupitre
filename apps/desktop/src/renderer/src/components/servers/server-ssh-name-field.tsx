import { useTranslations } from "@renderer/i18n/use-translations";
import { sshSlug } from "@shared/ssh-names";
import { controlClass, Field, fieldAria } from "../ui/field";

/**
 * The word a server answers to after `ssh`, typed beside its name.
 *
 * Under the field, what `ssh` will get: the typed word made fit for a `Host`
 * line, or the name's own when nothing is typed — the placeholder says which,
 * and a blank field means "from the name" rather than "none".
 */
export function ServerSshNameField({
  name,
  serverName,
  value,
  problem,
  disabled = false,
  onChange,
}: {
  /** The control's identifier, which the caption and the refusal hang from. */
  name: string;
  /** The server's name, which the SSH name is drawn from when nothing is typed. */
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
