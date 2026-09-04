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

/**
 * What has to happen before a binary reaches a server.
 *
 * The server is enrolled first: the platform gives it an identity, a seat and
 * the release the app is to push. Only then is the binary fetched, checked
 * against that release's checksum and signature, and sent. A development build
 * with no account keeps the binary it carries; a packaged one has none to fall
 * back on, and says so.
 */

const KNOWN_CODES = new Set<string>([
  ...PROTOCOL_ERROR_CODES,
  "timeout",
  "disconnected",
]);

export interface EnrollmentDeps {
  account: Pick<Account, "guard" | "state" | "enroll" | "releaseBytes">;
  embedded: (arch: string) => AgentResponse<AgentPayload>;
  build: BuildKind;
  releaseKey: string;
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
      code: "internal",
      message: "Aucune version de l'agent n'est publiée pour cette machine.",
      fix:
        build === "production"
          ? "Publie une version de l'agent depuis la console avant d'installer un serveur."
          : "Construis l'agent avec bun --cwd=apps/agent run build, puis reconstruis l'app.",
    },
  };
}

function enrollInput(server: Server, arch: string, deviceId: string) {
  return {
    device_id: deviceId,
    host: server.host,
    port: server.port,
    probe: { arch },
    ssh_user: server.user || "root",
    ...(server.hostFingerprint ? { fingerprint: server.hostFingerprint } : {}),
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
  const checked = checkAgentRelease(bytes, enrollment.release, deps.releaseKey);

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

export async function prepareAgent(
  server: Server,
  arch: string,
  deps: EnrollmentDeps
): Promise<AgentResponse<PreparedAgent>> {
  const allowed = lift(deps.account.guard());

  if (!allowed.ok) {
    return allowed;
  }

  const device = deps.account.state().device;

  if (!device) {
    return carried(null, arch, deps);
  }

  const enrolled = lift(
    await deps.account.enroll(enrollInput(server, arch, device.id))
  );

  if (!enrolled.ok) {
    return enrolled;
  }

  const enrollment = enrolled.result;

  if (enrollment.release.url === "") {
    return carried(enrollment, arch, deps);
  }

  const fetched = await fromPlatform(enrollment, arch, deps);

  return fetched.ok
    ? {
        ok: true,
        result: { enrollment: summaryOf(enrollment), payload: fetched.result },
      }
    : fetched;
}
