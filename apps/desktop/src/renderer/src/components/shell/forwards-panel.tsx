import { useServers } from "@renderer/stores/servers";
import { useTunnel } from "@renderer/stores/tunnel";
import { useEffect } from "react";
import { ForwardsList } from "./forwards-list";

export function ForwardsPanel() {
  const forwards = useTunnel((state) => state.forwards);
  const follow = useTunnel((state) => state.follow);
  const close = useTunnel((state) => state.closeForward);
  const config = useServers((state) => state.config);

  // Followed from the always-mounted sidebar so a forward outlives the page that opened it.
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
