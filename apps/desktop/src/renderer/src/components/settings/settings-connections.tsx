import { Panel } from "@renderer/components/ui/panel";
import { installedModules } from "@renderer/lib/modules";
import { useCatalog } from "@renderer/stores/catalog";
import { useConnections } from "@renderer/stores/connections";
import { useServers } from "@renderer/stores/servers";
import { snapshotOf, useSnapshot } from "@renderer/stores/snapshot";
import { useEffect } from "react";
import { CONNECTIONS } from "../connections/connection-descriptors";
import { ConnectionRow } from "../connections/connection-row";

/**
 * The third-party accounts the app holds, seen from the preferences.
 *
 * One line per account, its form folded under it — the same card the
 * configuration screen shows above the module that needs one, so connecting an
 * account there and looking at it here are one thing, not two screens that
 * could disagree. Forgetting an account names what it takes away: the modules
 * of the active server that declare it, by the manifests the catalogue read.
 */
export function SettingsConnections() {
  const read = useConnections((store) => store.read);
  const server = useServers((store) =>
    store.config?.servers.find((one) => one.id === store.config?.active)
  );
  const snapshot = useSnapshot((store) =>
    snapshotOf(store.state, server?.id ?? null)
  );
  const catalog = useCatalog((store) => store.catalog);

  const installed = snapshot ? installedModules(snapshot.services) : [];
  const manifests =
    catalog.status === "ready" && server && catalog.serverId === server.id
      ? catalog.catalog.modules
      : null;

  useEffect(() => {
    read();
  }, [read]);

  return (
    <Panel list>
      {CONNECTIONS.map((connection) => (
        <ConnectionRow
          connection={connection}
          installed={installed}
          key={connection.kind}
          manifests={manifests}
          serverName={server?.name ?? null}
        />
      ))}
    </Panel>
  );
}
