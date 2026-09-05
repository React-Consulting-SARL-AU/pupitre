import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { Enrollment } from "./account-run";
import type { AgentClient } from "./agent-client";
import { machineFacts } from "./agent-update-run";
import { asAgentError } from "./enrollment-run";
import { type EnrollmentGrant, sendEnrolment } from "./install-run";

/**
 * Repairing a server the platform no longer vouches for.
 *
 * A token lost or revoked leaves a machine that reads and refuses to act. The
 * repair is the gesture the installation already knows — a fresh enrolment
 * token, asked of the platform and handed to the agent on the secret line —
 * offered here to a server that is already installed, so a right is mended
 * without a detour through the console.
 *
 * Nothing that runs on the machine is touched: one `snapshot` to learn which
 * binary it runs, one `enroll` to repair the right. No binary is pushed, no
 * module replayed, no service restarted.
 */

export interface ReenrollDeps {
  client: Pick<AgentClient, "request">;
  /** The account's own right, asked before the platform is: it is what the platform would refuse on. */
  guard: () => AccountResponse<UsageRight>;
  enroll: (arch: string) => Promise<AccountResponse<Enrollment>>;
  /** The token the platform just granted, taken once and burnt. */
  grant: (platformServerId: string) => EnrollmentGrant | null;
  /** The last resort when the agent answers nothing at all: the shell probe. */
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
}

function ungranted(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      code: "internal",
      message:
        "La plateforme n'a remis aucun jeton d'enrôlement pour ce serveur.",
      fix: "Relance la réparation, ou reconnecte cet appareil depuis les réglages.",
    },
  };
}

export async function runReenroll(
  serverId: string,
  deps: ReenrollDeps
): Promise<AgentResponse<EnrollResult>> {
  const allowed = deps.guard();

  // The account's refusal comes first and in its own words: an account without
  // a usage right would be refused by the platform, and this way it is refused
  // before the server is asked anything at all.
  if (!allowed.ok) {
    return { ok: false, error: asAgentError(allowed.error) };
  }

  const facts = await machineFacts(serverId, deps);

  if (!facts.ok) {
    return facts;
  }

  const enrolled = await deps.enroll(facts.result.arch);

  if (!enrolled.ok) {
    return { ok: false, error: asAgentError(enrolled.error) };
  }

  const granted = deps.grant(enrolled.result.serverId);

  return granted
    ? await sendEnrolment(serverId, granted, deps.client)
    : ungranted();
}
