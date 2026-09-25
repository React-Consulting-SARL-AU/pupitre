import {
  APPROVED_KEY_MAX,
  APPROVED_KEY_PATTERN,
  ISSUED_AT_PATTERN,
  KEY_APPROVAL_SIGNATURE_MAX,
  KEY_FINGERPRINT_PATTERN,
  SERVER_ID_PATTERN,
  SIGNATURE_PATTERN,
  USER_ID_PATTERN,
} from "@pupitre/shared/keys"
import { t } from "elysia"
import { dateTime } from "../openapi-models"

const KEYS_BEAT_MAX_ITEMS = 100

const keyFingerprintSchema = t.String({ pattern: KEY_FINGERPRINT_PATTERN })

export const keyApprovalSchema = t.Object(
  {
    server_id: t.String(),
    public_key: t.String(),
    user_id: t.String(),
    issued_at: t.String(),
    signer: t.String(),
    signature: t.String(),
  },
  { $id: "KeyApproval" }
)

export const agentStateKeySchema = t.Object(
  {
    public_key: t.String(),
    user_id: t.String(),
    device_id: t.String(),
    approvals: t.Array(keyApprovalSchema),
  },
  { $id: "AgentStateKey" }
)

export const keysBeatSchema = t.Object(
  {
    signers: t.Array(keyFingerprintSchema, {
      maxItems: KEYS_BEAT_MAX_ITEMS,
    }),
    pending: t.Array(keyFingerprintSchema, {
      maxItems: KEYS_BEAT_MAX_ITEMS,
    }),
  },
  { $id: "KeysBeat" }
)

export const pendingKeyApprovalSchema = t.Object(
  {
    server: t.Object({ id: t.String(), name: t.String() }),
    device: t.Object({
      id: t.String(),
      name: t.String(),
      fingerprint: t.String(),
      public_key: t.String(),
    }),
    user: t.Object({ id: t.String(), name: t.String(), email: t.String() }),
    signers: t.Array(t.String()),
    reported_at: dateTime,
  },
  { $id: "PendingKeyApproval" }
)

export const keyApprovalSubmissionBody = t.Object({
  server_id: t.String({ pattern: SERVER_ID_PATTERN }),
  device_id: t.String({ minLength: 1 }),
  public_key: t.String({
    maxLength: APPROVED_KEY_MAX,
    pattern: APPROVED_KEY_PATTERN,
  }),
  user_id: t.String({ pattern: USER_ID_PATTERN }),
  issued_at: t.String({ pattern: ISSUED_AT_PATTERN }),
  signer: keyFingerprintSchema,
  signature: t.String({
    maxLength: KEY_APPROVAL_SIGNATURE_MAX,
    pattern: SIGNATURE_PATTERN,
  }),
})

export const keyApprovalReceiptSchema = t.Object(
  {
    server_id: t.String(),
    device_id: t.String(),
    signer: t.String(),
    issued_at: t.String(),
  },
  { $id: "KeyApprovalReceipt" }
)
