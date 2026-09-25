import { useTranslations } from "@renderer/i18n/use-translations";
import type { CloudflareZone } from "@shared/cloudflare";
import { Field, fieldAria } from "../ui/field";
import { Select } from "../ui/select";

export function ConfigZoneField({
  moduleId,
  zones,
  value,
  onChange,
}: {
  moduleId: string;
  zones: readonly CloudflareZone[];
  value: unknown;
  onChange: (domain: string) => void;
}) {
  const t = useTranslations();

  // The value stays the zone's name, so the manifest's `domain` field still gets a plain domain.
  const picked =
    typeof value === "string" && zones.some((zone) => value === zone.name)
      ? value
      : "";

  return (
    <Field
      help={t("connections.zone.help")}
      label={t("connections.zone.label")}
      name={`${moduleId}.zone`}
    >
      <Select
        {...fieldAria({ help: true, name: `${moduleId}.zone` })}
        kind="data"
        onChange={onChange}
        options={zones.map((zone) => ({ label: zone.name, value: zone.name }))}
        placeholder={t("connections.zone.pick")}
        value={picked}
      />
    </Field>
  );
}
