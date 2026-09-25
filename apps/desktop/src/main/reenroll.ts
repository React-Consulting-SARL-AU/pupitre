import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentResponse } from "@shared/agent";
import { account } from "./account";
import { agentClient } from "./agent";
import { enrollInput } from "./enrollment-run";
import { ed25519Fingerprint } from "./host-keys";
import { inspect } from "./inspection";
import { enrollmentGrant } from "./install";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { runReenroll } from "./reenroll-run";
import { refusalOf, refuseWith } from "./refusal";
import { byId, noteGrant, paths } from "./servers";

function refuse(
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith("bad_request", id, values);
}

function reenroll(serverId: string): Promise<AgentResponse<EnrollResult>> {
  const server = byId(serverId);

  if (!server) {
    return Promise.resolve(refuse("refusal.server.unknown"));
  }

  return runReenroll(server.id, {
    client: agentClient,
    enroll: async (arch) => {
      const device = account.state().device;

      // Without a device the platform would answer an obscure refusal instead of this clear one.
      if (!device) {
        return {
          ok: false,
          error: {
            ...refusalOf("bad_request", "refusal.device.none"),
          },
        };
      }

      const enrolled = await account.enroll(
        enrollInput(
          server,
          arch,
          device.id,
          await ed25519Fingerprint(server, paths())
        )
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
  handle("reenroll:start", shape(isString), (_event, serverId) =>
    reenroll(serverId)
  );
}
