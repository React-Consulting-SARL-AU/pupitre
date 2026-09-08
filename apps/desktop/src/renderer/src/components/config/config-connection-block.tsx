import type { Manifest } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { useEffect } from "react";
import { useCatalog } from "../../stores/catalog";
import { ConnectionCloudflare } from "../connections/connection-cloudflare";
import { Field, fieldControlClass } from "../ui/field";

/**
 * The account a module publishes through, asked where the module is configured.
 *
 * A connection used to live in the preferences, three screens away, and its
 * absence surfaced as an install that refused everything at the last moment.
 * It is asked here instead, above the questions it makes answerable, and the
 * zone it opens fills in the domain rather than asking for an identifier
 * nobody should have to copy.
 */
export function ConfigConnectionBlock({ module }: { module: Manifest }) {
  const t = useTranslations();

  const state = useConnections((store) => store.state.cloudflare);
  const zones = useConnections((store) => store.zones);
  const loadZones = useConnections((store) => store.loadZones);
  const setValue = useCatalog((store) => store.setValue);
  const domain = useCatalog((store) => store.values[module.id]?.domain);

  const connected = state.status === "connected";

  useEffect(() => {
    if (connected) {
      loadZones();
    }
  }, [connected, loadZones]);

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-line bg-sunken p-4"
      data-connection-block={module.connection}
    >
      {connected ? null : (
        <p className="text-[12px] text-ink-2 leading-relaxed">
          {t("connections.cloudflare.required")}
        </p>
      )}

      <ConnectionCloudflare compact />

      {connected && zones.length > 0 ? (
        <Field
          help={t("connections.zone.help")}
          label={t("connections.zone.label")}
          name={`${module.id}.zone`}
        >
          <select
            className={fieldControlClass}
            id={`${module.id}.zone`}
            onChange={(event) =>
              setValue(module.id, "domain", event.target.value)
            }
            value={
              typeof domain === "string" &&
              zones.some((zone) => domain === zone.name)
                ? domain
                : ""
            }
          >
            <option value="">{t("connections.zone.pick")}</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.name}>
                {zone.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {connected && zones.length === 0 ? (
        <p className="text-[12px] text-warn">{t("connections.zone.none")}</p>
      ) : null}
    </div>
  );
}
