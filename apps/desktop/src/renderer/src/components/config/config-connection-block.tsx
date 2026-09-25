import type { Manifest } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { useEffect } from "react";
import { useCatalog } from "../../stores/catalog";
import { BackupConnectionCard } from "../connections/backup-connection-card";
import { ConnectionCard } from "../connections/connection-card";
import { descriptorOf } from "../connections/connection-descriptors";
import { ConfigZoneField } from "./config-zone-field";

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

  // An unknown connection kind comes from a newer agent; draw nothing rather than ask for a token.
  if (!connection) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-md bg-sunken p-4"
      data-connection-block={module.connection}
    >
      {connected ? null : (
        <p className="text-ink-2 text-small leading-relaxed">
          {t("connections.required")}
        </p>
      )}

      {connection.kind === "backup" ? (
        <BackupConnectionCard connection={connection} />
      ) : (
        <ConnectionCard compact connection={connection} />
      )}

      {picksZone && zones.length > 0 ? (
        <ConfigZoneField
          moduleId={module.id}
          onChange={(picked) => setValue(module.id, "domain", picked)}
          value={domain}
          zones={zones}
        />
      ) : null}

      {picksZone && zones.length === 0 ? (
        <p className="text-small text-warn">{t("connections.zone.none")}</p>
      ) : null}
    </div>
  );
}
