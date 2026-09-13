import { useTranslations } from "@renderer/i18n/use-translations";
import type { CloudflareZone } from "@shared/cloudflare";
import { Field, fieldControlClass } from "../ui/field";

/**
 * The domain of an exposure, picked among the zones of the connected account.
 *
 * A domain typed by hand can be one the account does not carry, and the first
 * record written would say so; the list only offers what the token can write
 * into. The value stays a plain domain — the zone's name — so the manifest's
 * `domain` field receives what it always did.
 */
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
      <select
        className={fieldControlClass}
        id={`${moduleId}.zone`}
        onChange={(event) => onChange(event.target.value)}
        value={picked}
      >
        <option value="">{t("connections.zone.pick")}</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.name}>
            {zone.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
