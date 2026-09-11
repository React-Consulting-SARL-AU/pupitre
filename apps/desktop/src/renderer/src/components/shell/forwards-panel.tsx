import { useServers } from "@renderer/stores/servers";
import { useTunnel } from "@renderer/stores/tunnel";
import { useEffect } from "react";
import { ForwardsList } from "./forwards-list";

/**
 * The forwards, at the foot of the sidebar, from any screen.
 *
 * This is where the window starts listening to the main process: the list is
 * its, whole with every change, and a forward that a service page opened
 * stays reachable — and closable — long after that page is gone.
 */
export function ForwardsPanel() {
  const forwards = useTunnel((state) => state.forwards);
  const follow = useTunnel((state) => state.follow);
  const close = useTunnel((state) => state.closeForward);
  const config = useServers((state) => state.config);

  useEffect(() => follow(), [follow]);

  return (
    <ForwardsList
      forwards={forwards}
      nameOf={(serverId) =>
        config?.servers.find((server) => server.id === serverId)?.name ?? null
      }
      onClose={close}
    />
  );
}
