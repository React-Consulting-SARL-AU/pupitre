import {
  KeyApprovalSubmissionSchema,
  PendingKeyApprovalSchema,
} from "@pupitre/shared/keys"
import { KeyApprovalReceiptSchema } from "@pupitre/shared/platform-api/account"
import { fromContract } from "../contract-schema"

export const pendingKeyApprovalSchema = fromContract(PendingKeyApprovalSchema, {
  $id: "PendingKeyApproval",
})

export const keyApprovalSubmissionBody = fromContract(
  KeyApprovalSubmissionSchema
)

export const keyApprovalReceiptSchema = fromContract(KeyApprovalReceiptSchema, {
  $id: "KeyApprovalReceipt",
})
