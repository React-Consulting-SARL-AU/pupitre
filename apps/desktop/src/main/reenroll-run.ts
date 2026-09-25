import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { Enrollment } from "./account-run";
import type { AgentClient } from "./agent-client";
import { machineFacts } from "./agent-update-run";
import { asAgentError } from "./enrollment-run";
import { type EnrollmentGrant, sendEnrolment } from "./install-run";
import { refusalOf } from "./refusal";

export interface ReenrollDeps {
  client: Pick<AgentClient, "request">;
  guard: () => AccountResponse<UsageRight>;
  enroll: (arch: string) => Promise<AccountResponse<Enrollment>>;
  grant: (platformServerId: string) => EnrollmentGrant | null;
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
}

function ungranted(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      ...refusalOf("internal", "refusal.enrollment.none"),
    },
  };
}

export async function runReenroll(
  serverId: string,
  deps: ReenrollDeps
): Promise<AgentResponse<EnrollResult>> {
  const allowed = deps.guard();

  // The platform would refuse anyway: refusing first spares the server and keeps the account's wording.
  if (!allowed.ok) {
    return { ok: false, error: asAgentError(allowed.error) };
  }

  const facts = await machineFacts(serverId, deps, { polled: false });

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
