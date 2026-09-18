import {
  AFFILIATE_CODE_RE,
  AFFILIATE_MAX_FREE_MONTHS,
} from "@pupitre/shared/plans"
import { z } from "zod"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"
import type { Translate } from "@/lib/i18n/i18n"

export const MAX_AFFILIATE_LINK_NAME_LENGTH = 80

export const MIN_AFFILIATE_SEATS = 1

export interface ReasonCopy {
  required: string
  tooLong: string
}

/** Suspending a server and banning an account both write a reason someone else reads. */
export function reasonSchema({ required, tooLong }: ReasonCopy) {
  return z.object({
    reason: z.string().trim().min(1, required).max(MAX_REASON_LENGTH, tooLong),
  })
}

export type ReasonInput = z.input<ReturnType<typeof reasonSchema>>

export type ReasonValues = z.output<ReturnType<typeof reasonSchema>>

export function affiliateLinkSchema(t: Translate) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.links.nameRequired"))
      .max(
        MAX_AFFILIATE_LINK_NAME_LENGTH,
        t("admin.links.nameTooLong", { max: MAX_AFFILIATE_LINK_NAME_LENGTH })
      ),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (value) => value === "" || AFFILIATE_CODE_RE.test(value),
        t("admin.links.codeInvalid")
      ),
    free_months: z.coerce
      .number({ error: t("admin.links.integer") })
      .int(t("admin.links.integer"))
      .min(
        0,
        t("admin.links.freeMonthsRange", { max: AFFILIATE_MAX_FREE_MONTHS })
      )
      .max(
        AFFILIATE_MAX_FREE_MONTHS,
        t("admin.links.freeMonthsRange", { max: AFFILIATE_MAX_FREE_MONTHS })
      ),
    seats: z.coerce
      .number({ error: t("admin.links.integer") })
      .int(t("admin.links.integer"))
      .min(
        MIN_AFFILIATE_SEATS,
        t("admin.links.seatsMin", { min: MIN_AFFILIATE_SEATS })
      ),
  })
}

export type AffiliateLinkFormInput = z.input<
  ReturnType<typeof affiliateLinkSchema>
>

export type AffiliateLinkFormValues = z.output<
  ReturnType<typeof affiliateLinkSchema>
>
