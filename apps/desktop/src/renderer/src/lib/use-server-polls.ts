import { useEffect } from "react";
import { useSnapshot } from "../stores/snapshot";
import { useTunnel } from "../stores/tunnel";
import { noteServer } from "./completion";
import { poll } from "./poll";

const POLL_MS = 3000;

const POLL_PROCESSES_MS = 8000;

/** A restricted agent refuses the process table, so polling it would only stack the same refusal. */
export function useServerPolls(
  serverId: string | null,
  restricted: boolean
): void {
  const read = useSnapshot((s) => s.read);
  const readProcesses = useSnapshot((s) => s.readProcesses);
  const forget = useSnapshot((s) => s.forget);

  useEffect(() => {
    noteServer(serverId);
    useTunnel.getState().forget();

    if (!serverId) {
      forget();

      return;
    }

    return poll(() => read(serverId), POLL_MS);
  }, [serverId, read, forget]);

  useEffect(() => {
    if (!serverId || restricted) {
      return;
    }

    return poll(() => readProcesses(serverId), POLL_PROCESSES_MS);
  }, [serverId, restricted, readProcesses]);
}
