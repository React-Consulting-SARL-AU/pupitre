import { useEffect } from "react";
import { useSnapshot } from "../stores/snapshot";
import { useTunnel } from "../stores/tunnel";
import { noteServer } from "./completion";
import { poll } from "./poll";

/** The dashboard is the state of the machine: it is worth a beat of its own. */
const POLL_MS = 3000;

/** A full `ps` is not: it changes more slowly than a project's state. */
const POLL_PROCESSES_MS = 8000;

/**
 * The two beats of the active server: its snapshot, and its table of
 * processes. Both stop with the window hidden and start again when it shows.
 * Another machine, or none, forgets what the last one said of itself.
 *
 * A restricted agent refuses the table: asking for it every eight seconds
 * would only stack the same refusal under the notice that already says it.
 */
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
