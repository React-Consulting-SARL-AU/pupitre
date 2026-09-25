import {
  AFFILIATE_CODE_RE,
  AFFILIATE_MAX_FREE_MONTHS,
  AFFILIATE_NOTES_MAX_LENGTH,
  AFFILIATE_PARTNER_NAME_MAX_LENGTH,
} from "@pupitre/shared/plans"
import { z } from "zod"
import { endOfDayIso } from "@/lib/domain/admin"
import type { Translate } from "@/lib/i18n/i18n"
import { MAX_SEATS, MIN_SEATS } from "@/lib/schemas/billing"

export const MAX_AFFILIATE_LINK_NAME_LENGTH = 80

export const MIN_AFFILIATE_SEATS = 1

export const MAX_SUBSCRIPTION_NOTE_LENGTH = 500

function seatsField(t: Translate) {
  return z.coerce
    .number({ error: t("validation.quantity") })
    .int(t("validation.quantityInteger"))
    .min(MIN_SEATS, t("validation.quantityMin", { min: MIN_SEATS }))
    .max(MAX_SEATS, t("validation.quantityMax", { max: MAX_SEATS }))
}

/** The field holds a day or nothing; what leaves the form is the last instant of that day, or null. */
function endsAtField(t: Translate) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === "") {
        return null
      }

      const iso = endOfDayIso(value)

      if (iso === null) {
        context.addIssue({
          code: "custom",
          message: t("admin.subscriptions.endsAtInvalid"),
        })

        return z.NEVER
      }

      return iso
    })
}

/** A trial ends on a day: an empty field is a refusal here, not an open end. */
function trialEndField(t: Translate) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      const iso = value === "" ? null : endOfDayIso(value)

      if (iso === null) {
        context.addIssue({
          code: "custom",
          message: t("admin.subscriptions.endsAtRequired"),
        })

        return z.NEVER
      }

      return iso
    })
}

export function trialEndSchema(t: Translate) {
  return z.object({ ends_at: trialEndField(t) })
}

export type TrialEndInput = z.input<ReturnType<typeof trialEndSchema>>

export type TrialEndValues = z.output<ReturnType<typeof trialEndSchema>>

export function grantSubscriptionSchema(t: Translate) {
  return z.object({
    seats: seatsField(t),
    ends_at: endsAtField(t),
    note: z
      .string()
      .trim()
      .max(
        MAX_SUBSCRIPTION_NOTE_LENGTH,
        t("admin.servers.reasonTooLong", { max: MAX_SUBSCRIPTION_NOTE_LENGTH })
      ),
  })
}

export type GrantSubscriptionInput = z.input<
  ReturnType<typeof grantSubscriptionSchema>
>

export type GrantSubscriptionValues = z.output<
  ReturnType<typeof grantSubscriptionSchema>
>

export function resizeSubscriptionSchema(t: Translate) {
  return z.object({
    seats: seatsField(t),
    ends_at: endsAtField(t),
  })
}

export type ResizeSubscriptionInput = z.input<
  ReturnType<typeof resizeSubscriptionSchema>
>

export type ResizeSubscriptionValues = z.output<
  ReturnType<typeof resizeSubscriptionSchema>
>

export const MAX_ORGANIZATION_NAME_LENGTH = 80

export function renameOrganizationSchema(t: Translate) {
  const tooLong = t("admin.organizations.textTooLong", {
    max: MAX_ORGANIZATION_NAME_LENGTH,
  })

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.organizations.nameRequired"))
      .max(MAX_ORGANIZATION_NAME_LENGTH, tooLong),
    slug: z
      .string()
      .trim()
      .min(1, t("admin.organizations.slugRequired"))
      .max(MAX_ORGANIZATION_NAME_LENGTH, tooLong),
  })
}

export type RenameOrganizationInput = z.input<
  ReturnType<typeof renameOrganizationSchema>
>

export type RenameOrganizationValues = z.output<
  ReturnType<typeof renameOrganizationSchema>
>

function affiliateNameField(t: Translate) {
  return z
    .string()
    .trim()
    .min(1, t("admin.links.nameRequired"))
    .max(
      MAX_AFFILIATE_LINK_NAME_LENGTH,
      t("admin.links.nameTooLong", { max: MAX_AFFILIATE_LINK_NAME_LENGTH })
    )
}

function affiliateFreeMonthsField(t: Translate) {
  return z.coerce
    .number({ error: t("admin.links.integer") })
    .int(t("admin.links.integer"))
    .min(
      0,
      t("admin.links.freeMonthsRange", { max: AFFILIATE_MAX_FREE_MONTHS })
    )
    .max(
      AFFILIATE_MAX_FREE_MONTHS,
      t("admin.links.freeMonthsRange", { max: AFFILIATE_MAX_FREE_MONTHS })
    )
}

function affiliateSeatsField(t: Translate) {
  return z.coerce
    .number({ error: t("admin.links.integer") })
    .int(t("admin.links.integer"))
    .min(
      MIN_AFFILIATE_SEATS,
      t("admin.links.seatsMin", { min: MIN_AFFILIATE_SEATS })
    )
}

/** An empty field clears what the link carried: the API takes `null` for that. */
function clearableText(t: Translate, max: number) {
  return z
    .string()
    .trim()
    .max(max, t("admin.links.textTooLong", { max }))
    .transform((value) => (value === "" ? null : value))
}

function affiliatePartnerFields(t: Translate) {
  return {
    partner_name: clearableText(t, AFFILIATE_PARTNER_NAME_MAX_LENGTH),
    partner_email: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || z.email().safeParse(value).success,
        t("admin.links.partnerEmailInvalid")
      )
      .transform((value) => (value === "" ? null : value)),
    notes: clearableText(t, AFFILIATE_NOTES_MAX_LENGTH),
  }
}

export function affiliateLinkSchema(t: Translate) {
  return z.object({
    name: affiliateNameField(t),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (value) => value === "" || AFFILIATE_CODE_RE.test(value),
        t("admin.links.codeInvalid")
      ),
    free_months: affiliateFreeMonthsField(t),
    seats: affiliateSeatsField(t),
    ...affiliatePartnerFields(t),
  })
}

export function affiliateLinkEditSchema(t: Translate) {
  return z.object({
    name: affiliateNameField(t),
    free_months: affiliateFreeMonthsField(t),
    seats: affiliateSeatsField(t),
    ...affiliatePartnerFields(t),
  })
}

export type AffiliateLinkFormInput = z.input<
  ReturnType<typeof affiliateLinkSchema>
>

export type AffiliateLinkFormValues = z.output<
  ReturnType<typeof affiliateLinkSchema>
>

export type AffiliateLinkEditInput = z.input<
  ReturnType<typeof affiliateLinkEditSchema>
>

export type AffiliateLinkEditValues = z.output<
  ReturnType<typeof affiliateLinkEditSchema>
>
