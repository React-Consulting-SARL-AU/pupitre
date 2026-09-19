import { z } from "zod"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"
import type { Translate } from "@/lib/i18n/i18n"

export interface ConfirmFormRules {
  reason: "optional" | "required"
  /** The word to retype, compared without case; absent when the dialog asks for none. */
  keyword?: string
  until: boolean
}

function reasonField(t: Translate, rule: ConfirmFormRules["reason"]) {
  const field = z
    .string()
    .trim()
    .max(
      MAX_REASON_LENGTH,
      t("admin.servers.reasonTooLong", { max: MAX_REASON_LENGTH })
    )

  return rule === "required" ? field.min(1, t("confirm.reasonRequired")) : field
}

function keywordField(t: Translate, keyword: string | undefined) {
  const field = z.string().trim()

  return keyword === undefined
    ? field
    : field.refine(
        (value) => value.toLowerCase() === keyword.toLowerCase(),
        t("confirm.keywordMismatch", { keyword })
      )
}

/** The field holds a local date and time; what leaves the form is its instant, or null. */
function untilField(t: Translate, asked: boolean) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === "") {
        return null
      }

      const instant = new Date(value)

      if (Number.isNaN(instant.getTime())) {
        context.addIssue({ code: "custom", message: t("confirm.untilInvalid") })

        return z.NEVER
      }

      if (asked && instant.getTime() <= Date.now()) {
        context.addIssue({ code: "custom", message: t("confirm.untilPast") })

        return z.NEVER
      }

      return instant.toISOString()
    })
}

export function confirmFormSchema(t: Translate, rules: ConfirmFormRules) {
  return z.object({
    reason: reasonField(t, rules.reason),
    keyword: keywordField(t, rules.keyword),
    until: untilField(t, rules.until),
  })
}

export type ConfirmFormInput = z.input<ReturnType<typeof confirmFormSchema>>

export type ConfirmFormValues = z.output<ReturnType<typeof confirmFormSchema>>
