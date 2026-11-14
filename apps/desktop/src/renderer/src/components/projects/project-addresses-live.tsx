import type { Project } from "@pupitre/shared/agent-protocol/state";
import { useProject } from "@renderer/stores/project";
import { forwardsOf, useTunnel } from "@renderer/stores/tunnel";
import type { AgentError } from "@shared/agent";
import { useState } from "react";
import { ProjectAddresses } from "./project-addresses";

/** The addresses with this computer's forwards: the store is the sidebar's, so a forward outlives the page. */
export function ProjectAddressesLive({
  serverId,
  project,
  onPublish,
}: {
  serverId: string;
  project: Project;
  onPublish: () => void;
}) {
  const forwards = useTunnel((state) => state.forwards);
  const forward = useTunnel((state) => state.forward);
  const closeForward = useTunnel((state) => state.closeForward);
  const keepForward = useTunnel((state) => state.keepForward);
  const turnAccess = useProject((state) => state.turnAccess);

  const [refused, setRefused] = useState<AgentError | null>(null);

  return (
    <ProjectAddresses
      forwards={forwardsOf(forwards, serverId)}
      onCloseForward={closeForward}
      onKeepForward={keepForward}
      onPublish={onPublish}
      onReach={async (port, process) => {
        setRefused(
          await forward(serverId, port, `${project.name}/${process}`, {
            preferRemote: true,
          })
        );
      }}
      onTurnAccess={(process) => turnAccess(serverId, project, process)}
      problem={refused}
      project={project}
    />
  );
}
