import { PROTOCOL_ERROR_CODES } from "@pupitre/shared/agent-protocol/errors";
import type {
  AccountError,
  AccountResponse,
  BuildKind,
  EnrollmentSummary,
} from "@shared/account";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { Server } from "@shared/servers";
import type { Account, Enrollment } from "./account-run";
import type { AgentPayload } from "./agent-binary";
import { checkAgentRelease } from "./agent-release";
import { refusalOf } from "./refusal";
import { trace } from "./trace";

const KNOWN_CODES = new Set<string>([
  ...PROTOCOL_ERROR_CODES,
  "timeout",
  "disconnected",
  "server_suspended",
]);

export interface EnrollmentDeps {
  account: Pick<
    Account,
    "guard" | "state" | "enroll" | "releaseBytes" | "heldEnrollment"
  >;
  embedded: (arch: string) => AgentResponse<AgentPayload>;
  build: BuildKind;
  releaseKey: string;
  /** The install that follows asks for platform-managed things (tunnel, subdomain) by this id. */
  bind: (serverId: string, platformServerId: string) => void;
  hostFingerprint: (server: Server) => Promise<string | null>;
}

export interface PreparedAgent {
  payload: AgentPayload;
  enrollment: EnrollmentSummary | null;
}

export function asAgentError(error: AccountError): AgentError {
  const code = error.code === "offline" ? "disconnected" : error.code;

  return {
    code: (KNOWN_CODES.has(code) ? code : "internal") as AgentError["code"],
    message: error.message,
    ...(error.fix ? { fix: error.fix } : {}),
    ...(error.phrase ? { phrase: error.phrase } : {}),
  };
}

export function summaryOf(enrollment: Enrollment): EnrollmentSummary {
  return {
    release: {
      available: enrollment.release.url !== "",
      channel: enrollment.release.channel,
      version: enrollment.release.version,
    },
    serverId: enrollment.serverId,
  };
}

function lift<T>(answer: AccountResponse<T>): AgentResponse<T> {
  return answer.ok
    ? { ok: true, result: answer.result }
    : { ok: false, error: asAgentError(answer.error) };
}

function unpublished(build: BuildKind): AgentResponse<never> {
  return {
    ok: false,
    error: {
      ...refusalOf(
        "internal",
        build === "production"
          ? "refusal.release.none"
          : "refusal.binary.missing"
      ),
    },
  };
}

/** Ed25519 fingerprint: the platform refuses a token traded with any other host key than the pinned one. */
export function enrollInput(
  server: Server,
  arch: string,
  deviceId: string,
  ed25519: string | null
) {
  return {
    device_id: deviceId,
    host: server.host,
    port: server.port,
    probe: { arch },
    ssh_user: server.user || "root",
    ...(ed25519 ? { fingerprint: ed25519 } : {}),
  };
}

async function fromPlatform(
  enrollment: Enrollment,
  arch: string,
  deps: EnrollmentDeps
): Promise<AgentResponse<AgentPayload>> {
  const downloaded = lift(
    await deps.account.releaseBytes(enrollment.release.version, arch)
  );

  if (!downloaded.ok) {
    return downloaded;
  }

  const bytes = downloaded.result;
  const checked = checkAgentRelease(
    bytes,
    { ...enrollment.release, arch },
    deps.releaseKey
  );

  if (!checked.ok) {
    return checked;
  }

  return {
    ok: true,
    result: {
      arch,
      bytes: bytes.byteLength,
      content: Buffer.from(bytes),
      path: `pupitred ${enrollment.release.version}`,
      sha256: checked.result.sha256,
      signature: enrollment.release.signature,
      version: enrollment.release.version,
    },
  };
}

function carried(
  enrollment: Enrollment | null,
  arch: string,
  deps: EnrollmentDeps
): AgentResponse<PreparedAgent> {
  const payload =
    deps.build === "development"
      ? deps.embedded(arch)
      : unpublished(deps.build);

  return payload.ok
    ? {
        ok: true,
        result: {
          enrollment: enrollment ? summaryOf(enrollment) : null,
          payload: payload.result,
        },
      }
    : payload;
}

/** A retry after a failed push reuses the held enrolment rather than buying a second seat. */
async function enrolment(
  server: Server,
  arch: string,
  deviceId: string,
  deps: EnrollmentDeps
): Promise<AgentResponse<Enrollment>> {
  const held = server.grant
    ? deps.account.heldEnrollment(server.grant.id)
    : null;

  if (held) {
    trace("agent-binary", "enrolment-held", {
      release: held.release.version,
      server: server.id,
    });

    return { ok: true, result: held };
  }

  const ed25519 = await deps.hostFingerprint(server);

  return lift(
    await deps.account.enroll(enrollInput(server, arch, deviceId, ed25519))
  );
}

export async function prepareAgent(
  server: Server,
  arch: string,
  deps: EnrollmentDeps
): Promise<AgentResponse<PreparedAgent>> {
  trace("agent-binary", "prepare", { arch, server: server.id });

  const allowed = lift(deps.account.guard());

  if (!allowed.ok) {
    return allowed;
  }

  const device = deps.account.state().device;

  if (!device) {
    return carried(null, arch, deps);
  }

  const enrolled = await enrolment(server, arch, device.id, deps);

  if (!enrolled.ok) {
    return enrolled;
  }

  const enrollment = enrolled.result;

  deps.bind(server.id, enrollment.serverId);

  if (enrollment.release.url === "") {
    return carried(enrollment, arch, deps);
  }

  trace("agent-binary", "enrolled", {
    release: enrollment.release.version,
    server: server.id,
  });

  const fetched = await fromPlatform(enrollment, arch, deps);

  return fetched.ok
    ? {
        ok: true,
        result: { enrollment: summaryOf(enrollment), payload: fetched.result },
      }
    : fetched;
}
