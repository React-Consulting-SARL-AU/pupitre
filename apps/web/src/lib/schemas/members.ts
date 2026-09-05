import { z } from "zod"
import { INVITABLE_ROLES } from "@/lib/domain/roles"
import type { Translate } from "@/lib/i18n/i18n"

function emailField(t: Translate) {
  return z
    .string()
    .trim()
    .min(1, t("validation.emailRequired"))
    .email(t("validation.emailUnreadable"))
    .transform((value) => value.toLowerCase())
}

export function inviteSchema(t: Translate) {
  return z.object({
    email: emailField(t),
    role: z.enum(INVITABLE_ROLES as [string, ...string[]]),
  })
}

export type InviteInput = z.input<ReturnType<typeof inviteSchema>>

export type InviteValues = z.output<ReturnType<typeof inviteSchema>>

export function assignByEmailSchema(t: Translate) {
  return z.object({ email: emailField(t) })
}

export type AssignByEmailInput = z.input<ReturnType<typeof assignByEmailSchema>>

export type AssignByEmailValues = z.output<
  ReturnType<typeof assignByEmailSchema>
>
