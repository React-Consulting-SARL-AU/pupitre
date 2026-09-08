import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentResponse } from "@shared/agent";
import { ipcMain } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import { enrollInput } from "./enrollment-run";
import { inspect } from "./inspection";
import { enrollmentGrant } from "./install";
import { runReenroll } from "./reenroll-run";
import { refusalOf, refuseWith } from "./refusal";
import { byId, noteGrant } from "./servers";

/**
 * The repair of a restricted server, seen from the main process.
 *
 * The renderer names a server and nothing else: the address, the device and the
 * token are all read here. What comes back is the agent's own answer to
 * `enroll`, refusal included, as it arrived.
 */

function refuse(
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith("bad_request", id, values);
}

function reenroll(serverId: unknown): Promise<AgentResponse<EnrollResult>> {
  const server = typeof serverId === "string" ? byId(serverId) : null;

  if (!server) {
    return Promise.resolve(refuse("refusal.server.unknown"));
  }

  return runReenroll(server.id, {
    client: agentClient,
    enroll: async (arch) => {
      const device = account.state().device;

      // Without a device the platform has no one to sign an enrolment for, and
      // asking anyway would trade a clear refusal for an obscure one.
      if (!device) {
        return {
          ok: false,
          error: {
            ...refusalOf("bad_request", "refusal.device.none"),
          },
        };
      }

      const enrolled = await account.enroll(
        enrollInput(server, arch, device.id)
      );

      if (enrolled.ok) {
        noteGrant(server.id, enrolled.result.serverId);
      }

      return enrolled;
    },
    grant: enrollmentGrant,
    guard: () => account.guard(),
    probe: inspect,
  });
}

export function registerReenroll(): void {
  ipcMain.handle("reenroll:start", (_event, serverId: unknown) =>
    reenroll(serverId)
  );
}
