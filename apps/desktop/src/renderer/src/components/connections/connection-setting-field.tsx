import { Field, fieldControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ConnectionKind } from "@shared/connections";
import type { ConnectionSettingDescriptor } from "./connection-descriptors";

export function ConnectionSettingField({
  kind,
  setting,
  value,
  onChange,
}: {
  kind: ConnectionKind;
  setting: ConnectionSettingDescriptor;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();

  const name = `connections.${kind}.${setting.key}`;

  return (
    <Field help={t(setting.help)} label={t(setting.label)} name={name} required>
      <input
        aria-describedby={`${name}-help`}
        autoCapitalize="off"
        autoComplete="off"
        className={fieldControlClass}
        id={name}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        type="text"
        value={value}
      />
    </Field>
  );
}
