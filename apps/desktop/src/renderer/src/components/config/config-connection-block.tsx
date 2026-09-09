import type { Manifest } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { useEffect } from "react";
import { useCatalog } from "../../stores/catalog";
import { ConnectionCard } from "../connections/connection-card";
import { descriptorOf } from "../connections/connection-descriptors";
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

  const connection = descriptorOf(module.connection ?? "");
  const state = useConnections((store) =>
    connection ? store.state[connection.kind] : null
  );
  const zones = useConnections((store) => store.zones);
  const loadZones = useConnections((store) => store.loadZones);
  const setValue = useCatalog((store) => store.setValue);
  const domain = useCatalog((store) => store.values[module.id]?.domain);

  const connected = state?.status === "connected";
  const picksZone = connection?.kind === "cloudflare" && connected;

  useEffect(() => {
    if (picksZone) {
      loadZones();
    }
  }, [picksZone, loadZones]);

  // A module naming a connection this app has never heard of comes from an
  // agent that is ahead of it: nothing is drawn rather than a block that would
  // ask for a token it could not place.
  if (!connection) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-line bg-sunken p-4"
      data-connection-block={module.connection}
    >
      {connected ? null : (
        <p className="text-[12px] text-ink-2 leading-relaxed">
          {t("connections.required")}
        </p>
      )}

      <ConnectionCard compact connection={connection} />

      {picksZone && zones.length > 0 ? (
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

      {picksZone && zones.length === 0 ? (
        <p className="text-[12px] text-warn">{t("connections.zone.none")}</p>
      ) : null}
    </div>
  );
}
