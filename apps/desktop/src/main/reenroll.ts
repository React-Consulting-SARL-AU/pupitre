import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentResponse } from "@shared/agent";
import { ipcMain } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import { enrollInput } from "./enrollment-run";
import { inspect } from "./inspection";
import { enrollmentGrant } from "./install";
import { runReenroll } from "./reenroll-run";
import { byId } from "./servers";

/**
 * The repair of a restricted server, seen from the main process.
 *
 * The renderer names a server and nothing else: the address, the device and the
 * token are all read here. What comes back is the agent's own answer to
 * `enroll`, refusal included, as it arrived.
 */

function refuse(message: string, fix: string): AgentResponse<never> {
  return { ok: false, error: { code: "bad_request", fix, message } };
}

function reenroll(serverId: unknown): Promise<AgentResponse<EnrollResult>> {
  const server = typeof serverId === "string" ? byId(serverId) : null;

  if (!server) {
    return Promise.resolve(
      refuse(
        "Ce serveur n'est plus dans la liste.",
        "Choisis un serveur dans les réglages."
      )
    );
  }

  return runReenroll(server.id, {
    client: agentClient,
    enroll: (arch) => {
      const device = account.state().device;

      // Without a device the platform has no one to sign an enrolment for, and
      // asking anyway would trade a clear refusal for an obscure one.
      return device
        ? account.enroll(enrollInput(server, arch, device.id))
        : Promise.resolve({
            ok: false,
            error: {
              code: "entitlement_required",
              message: "Cet appareil n'est connecté à aucun compte Pupitre.",
              fix: "Connecte-toi depuis les réglages, puis relance la réparation.",
            },
          });
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
