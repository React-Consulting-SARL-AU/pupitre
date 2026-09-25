import { spawn } from "node:child_process";
import {
  ApprovedKeySchema,
  issuedAtOf,
  KEY_APPROVAL_NAMESPACE,
  type KeyApprovalFields,
  type KeyApprovalSubmission,
  KeyApprovalSubmissionSchema,
  keyApprovalMessage,
  type PendingKeyApproval,
  publicKeyFingerprint,
} from "@pupitre/shared/keys";
import type { AgentResponse } from "@shared/agent";
import type { KeyApprovalReceipt } from "@shared/key-approvals";
import type { Account } from "./account-run";
import { asAgentError } from "./enrollment-run";
import { refuseWith } from "./refusal";

const SIGN_MS = 15_000;

const LINE_BREAK = /\r?\n/;

export type ApprovalSigner = (
  message: string,
  keyPath: string
) => Promise<AgentResponse<string>>;

export interface KeyApprovalsDeps {
  account: Pick<Account, "keyApprovals" | "approveKey">;
  /** This computer's device public key, or null when it has none yet. */
  devicePublicKey: () => string | null;
  deviceKeyPath: () => string;
  sign: ApprovalSigner;
  now: () => Date;
}

export interface KeyApprovals {
  list: () => Promise<AgentResponse<PendingKeyApproval[]>>;
  approve: (
    serverId: unknown,
    deviceId: unknown
  ) => Promise<AgentResponse<KeyApprovalReceipt>>;
}

function firstLine(text: string): string {
  return text.trim().split(LINE_BREAK)[0] ?? "";
}

export function sshKeygenSigner(binary = "ssh-keygen"): ApprovalSigner {
  return (message, keyPath) =>
    new Promise((resolve) => {
      const child = spawn(
        binary,
        ["-Y", "sign", "-n", KEY_APPROVAL_NAMESPACE, "-f", keyPath, "-q"],
        { stdio: ["pipe", "pipe", "pipe"], timeout: SIGN_MS }
      );
      let signature = "";
      let complaint = "";

      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        signature += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        complaint += chunk;
      });
      child.stdin.on("error", () => undefined);

      child.on("error", (error: NodeJS.ErrnoException) => {
        resolve(
          error.code === "ENOENT"
            ? refuseWith("internal", "refusal.keyApproval.sshKeygenMissing")
            : refuseWith("internal", "refusal.keyApproval.signFailed", {
                reason: error.message,
              })
        );
      });

      child.on("close", (code) => {
        resolve(
          code === 0 && signature.length > 0
            ? { ok: true, result: signature }
            : refuseWith("internal", "refusal.keyApproval.signFailed", {
                reason: firstLine(complaint) || `exit ${code ?? "killed"}`,
              })
        );
      });

      child.stdin.end(message);
    });
}

async function shownKeyHolds(approval: PendingKeyApproval): Promise<boolean> {
  if (!ApprovedKeySchema.safeParse(approval.device.public_key).success) {
    return false;
  }

  return (
    (await publicKeyFingerprint(approval.device.public_key)) ===
    approval.device.fingerprint
  );
}

export function createKeyApprovals(deps: KeyApprovalsDeps): KeyApprovals {
  let listed: PendingKeyApproval[] = [];

  async function ownFingerprint(): Promise<string | null> {
    const line = deps.devicePublicKey();

    return line ? await publicKeyFingerprint(line) : null;
  }

  async function submit(
    approval: PendingKeyApproval,
    signer: string
  ): Promise<AgentResponse<KeyApprovalReceipt>> {
    const fields: KeyApprovalFields = {
      issued_at: issuedAtOf(deps.now()),
      public_key: approval.device.public_key,
      server_id: approval.server.id,
      user_id: approval.user.id,
    };

    const signed = await deps.sign(
      keyApprovalMessage(fields),
      deps.deviceKeyPath()
    );

    if (!signed.ok) {
      return signed;
    }

    const submission: KeyApprovalSubmission = {
      ...fields,
      device_id: approval.device.id,
      signature: signed.result,
      signer,
    };

    if (!KeyApprovalSubmissionSchema.safeParse(submission).success) {
      return refuseWith("internal", "refusal.keyApproval.malformed", {
        device: approval.device.name,
      });
    }

    const answer = await deps.account.approveKey(submission);

    return answer.ok
      ? answer
      : { ok: false, error: asAgentError(answer.error) };
  }

  return {
    async list() {
      const signer = await ownFingerprint();

      if (!signer) {
        return refuseWith("bad_request", "refusal.keyApproval.noDeviceKey");
      }

      const answer = await deps.account.keyApprovals();

      if (!answer.ok) {
        return { ok: false, error: asAgentError(answer.error) };
      }

      listed = answer.result.filter((approval) =>
        approval.signers.includes(signer)
      );

      return { ok: true, result: listed };
    },

    async approve(serverId, deviceId) {
      const approval = listed.find(
        (one) => one.server.id === serverId && one.device.id === deviceId
      );

      if (!approval) {
        return refuseWith("bad_request", "refusal.keyApproval.unknown");
      }

      const signer = await ownFingerprint();

      if (!signer) {
        return refuseWith("bad_request", "refusal.keyApproval.noDeviceKey");
      }

      if (!approval.signers.includes(signer)) {
        return refuseWith("bad_request", "refusal.keyApproval.notSigner", {
          server: approval.server.name,
        });
      }

      if (!(await shownKeyHolds(approval))) {
        return refuseWith("bad_request", "refusal.keyApproval.mismatch", {
          device: approval.device.name,
        });
      }

      const answer = await submit(approval, signer);

      if (answer.ok) {
        listed = listed.filter((one) => one !== approval);
      }

      return answer;
    },
  };
}
