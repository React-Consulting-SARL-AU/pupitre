import { MAIL_SENDER_ADDRESSES } from "@pupitre/shared/legal"
import { z } from "zod"
import type { Translate } from "@/lib/i18n/i18n"

export const MAX_SUBJECT_LENGTH = 200

export function parseRecipients(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
}

function readable(email: string): boolean {
  return z.email().safeParse(email).success
}

export function composeSchema(t: Translate) {
  return z.object({
    from: z.enum(MAIL_SENDER_ADDRESSES, { error: t("inbox.fromRequired") }),
    to: z
      .string()
      .transform(parseRecipients)
      .refine((list) => list.length > 0, t("inbox.toRequired"))
      .refine((list) => list.every(readable), t("inbox.toUnreadable")),
    subject: z
      .string()
      .trim()
      .min(1, t("inbox.subjectRequired"))
      .max(
        MAX_SUBJECT_LENGTH,
        t("inbox.subjectTooLong", {
          max: MAX_SUBJECT_LENGTH,
        })
      ),
    text: z.string().trim().min(1, t("inbox.textRequired")),
  })
}

export type ComposeInput = z.input<ReturnType<typeof composeSchema>>

export type ComposeValues = z.output<ReturnType<typeof composeSchema>>

export function replySchema(t: Translate) {
  return z.object({
    text: z.string().trim().min(1, t("inbox.replyRequired")),
  })
}

export type ReplyInput = z.input<ReturnType<typeof replySchema>>

export type ReplyValues = z.output<ReturnType<typeof replySchema>>
