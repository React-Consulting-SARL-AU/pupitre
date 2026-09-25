import {
  MAIL_DISPLAY_NAME_MAX_LENGTH,
  MAIL_SIGNATURE_MAX_LENGTH,
} from "@pupitre/shared/legal"
import { z } from "zod"
import type { Translate } from "@/lib/i18n/i18n"

export const MAX_SUBJECT_LENGTH = 200

export const MAX_TEMPLATE_NAME_LENGTH = 80

export const MAX_TEMPLATE_BODY_LENGTH = 20_000

export const MAX_NOTE_LENGTH = 10_000

export function parseRecipients(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
}

function readable(email: string): boolean {
  return z.email().safeParse(email).success
}

export function isReadableEmail(value: string): boolean {
  return readable(value)
}

export function composeSchema(t: Translate) {
  return z.object({
    mailbox_id: z.string().min(1, t("inbox.fromRequired")),
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

export function mailboxSchema(t: Translate) {
  return z.object({
    address: z
      .string()
      .trim()
      .min(1, t("inbox.mailboxAddressRequired"))
      .max(64, t("inbox.mailboxAddressTooLong", { max: 64 })),
    display_name: z
      .string()
      .trim()
      .min(1, t("inbox.mailboxNameRequired"))
      .max(
        MAIL_DISPLAY_NAME_MAX_LENGTH,
        t("inbox.mailboxNameTooLong", { max: MAIL_DISPLAY_NAME_MAX_LENGTH })
      ),
    signature: z.string().max(
      MAIL_SIGNATURE_MAX_LENGTH,
      t("inbox.mailboxSignatureTooLong", {
        max: MAIL_SIGNATURE_MAX_LENGTH,
      })
    ),
  })
}

export type MailboxFormInput = z.input<ReturnType<typeof mailboxSchema>>

export type MailboxFormValues = z.output<ReturnType<typeof mailboxSchema>>

export function templateSchema(t: Translate) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("inbox.templateNameRequired"))
      .max(
        MAX_TEMPLATE_NAME_LENGTH,
        t("inbox.templateNameTooLong", { max: MAX_TEMPLATE_NAME_LENGTH })
      ),
    body: z
      .string()
      .trim()
      .min(1, t("inbox.templateBodyRequired"))
      .max(
        MAX_TEMPLATE_BODY_LENGTH,
        t("inbox.templateBodyTooLong", { max: MAX_TEMPLATE_BODY_LENGTH })
      ),
    mailbox_id: z.string(),
  })
}

export type TemplateFormInput = z.input<ReturnType<typeof templateSchema>>

export type TemplateFormValues = z.output<ReturnType<typeof templateSchema>>

export function noteSchema(t: Translate) {
  return z.object({
    body: z
      .string()
      .trim()
      .min(1, t("inbox.noteRequired"))
      .max(MAX_NOTE_LENGTH, t("inbox.noteTooLong", { max: MAX_NOTE_LENGTH })),
  })
}
