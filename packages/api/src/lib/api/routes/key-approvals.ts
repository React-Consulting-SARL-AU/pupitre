import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import {
  KEY_APPROVAL_MAX_AGE_SECONDS,
  KEY_APPROVAL_NAMESPACE,
} from "@pupitre/shared/keys"
import { Elysia, t } from "elysia"
import { type MessageKey, translate } from "../../i18n"
import {
  KeyApprovalForbiddenError,
  KeyApprovalInvalidError,
  type KeyApprovalRefusal,
  KeyApprovalTargetUnknownError,
  listPendingKeyApprovals,
  submitKeyApproval,
} from "../../servers/key-approvals"
import { type ApiErrorPayload, apiError } from "../errors"
import { dataResponse, errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import {
  keyApprovalReceiptSchema,
  keyApprovalSubmissionBody,
  pendingKeyApprovalSchema,
} from "./key-approval-schemas"

const DAY_SECONDS = 86_400

interface Refusal {
  status: 403 | 404 | 422
  payload: ApiErrorPayload
}

const INVALID_MESSAGES: Record<
  KeyApprovalRefusal,
  { message: MessageKey; fix: MessageKey }
> = {
  mismatch: {
    message: "key_approval_mismatch",
    fix: "key_approval_mismatch_fix",
  },
  not_held: {
    message: "key_approval_not_held",
    fix: "key_approval_not_held_fix",
  },
  signer: { message: "key_approval_signer", fix: "key_approval_signer_fix" },
  issued_at: {
    message: "key_approval_issued_at",
    fix: "key_approval_issued_at_fix",
  },
  signature: {
    message: "key_approval_signature",
    fix: "key_approval_signature_fix",
  },
}

function refusalFor(error: unknown, locale: Locale): Refusal | null {
  if (error instanceof KeyApprovalTargetUnknownError) {
    return {
      status: 404,
      payload: apiError(
        "not_found",
        translate(locale, "key_approval_target_not_found")
      ),
    }
  }

  if (error instanceof KeyApprovalForbiddenError) {
    return {
      status: 403,
      payload: apiError(
        "forbidden",
        translate(locale, "key_approval_forbidden"),
        translate(locale, "key_approval_forbidden_fix")
      ),
    }
  }

  if (error instanceof KeyApprovalInvalidError) {
    const { message, fix } = INVALID_MESSAGES[error.refusal]

    return {
      status: 422,
      payload: apiError(
        "key_approval_invalid",
        translate(locale, message),
        translate(locale, fix, {
          days: KEY_APPROVAL_MAX_AGE_SECONDS / DAY_SECONDS,
          namespace: KEY_APPROVAL_NAMESPACE,
        })
      ),
    }
  }

  return null
}

export const keyApprovalsRoutes = new Elysia({
  name: "key-approvals-routes",
  tags: ["Key approvals"],
})
  .use(requireAuth)
  .get(
    "/me/key-approvals",
    async ({ user }) => ({ data: await listPendingKeyApprovals(user.id) }),
    {
      detail: {
        summary:
          "Les clés qu'un serveur attend et que l'appelant peut autoriser",
      },
      response: {
        200: t.Object(
          { data: t.Array(pendingKeyApprovalSchema) },
          { $id: "PendingKeyApprovalList" }
        ),
        401: errorResponse,
      },
    }
  )
  .post(
    "/me/key-approvals",
    async ({ user, body, request, set }) => {
      try {
        const receipt = await submitKeyApproval(user.id, body)

        set.status = 201

        return { data: receipt }
      } catch (error) {
        const refusal = refusalFor(error, resolveLocale(request.headers))

        if (!refusal) {
          throw error
        }

        set.status = refusal.status

        return refusal.payload
      }
    },
    {
      body: keyApprovalSubmissionBody,
      detail: { summary: "Relayer l'approbation signée d'une clé d'appareil" },
      response: {
        201: dataResponse(keyApprovalReceiptSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
