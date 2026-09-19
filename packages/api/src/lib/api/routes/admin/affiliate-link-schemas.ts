import {
  AFFILIATE_CODE_RE,
  AFFILIATE_MAX_FREE_MONTHS,
  AFFILIATE_NOTES_MAX_LENGTH,
  AFFILIATE_PARTNER_NAME_MAX_LENGTH,
} from "@pupitre/shared/plans"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"
import { MAX_SEATS, MIN_SEATS } from "../orgs/schemas"
import { emailSchema } from "../servers/schemas"

const MAX_NAME_LENGTH = 80

const adminAffiliateLinkFields = {
  id: t.String(),
  code: t.String(),
  name: t.String(),
  free_months: t.Integer(),
  seats: t.Integer(),
  disabled: t.Boolean(),
  created_at: dateTime,
  referrals: t.Integer(),
  partner_name: t.Nullable(t.String()),
  clicks_30_days: t.Integer(),
  url: t.String(),
}

export const adminAffiliateLinkSchema = t.Object(adminAffiliateLinkFields, {
  $id: "AdminAffiliateLink",
})

export const adminAffiliateLinkDetailSchema = t.Object(
  {
    ...adminAffiliateLinkFields,
    partner: t.Nullable(
      t.Object({ name: t.Nullable(t.String()), email: t.Nullable(t.String()) })
    ),
    notes: t.Nullable(t.String()),
    clicks: t.Object({ total: t.Integer(), last_30_days: t.Integer() }),
    conversion: t.Object({
      referred: t.Integer(),
      trialing: t.Integer(),
      active: t.Integer(),
      past_due: t.Integer(),
      canceled: t.Integer(),
      seats: t.Integer(),
    }),
    organizations: t.Array(
      t.Object({
        id: t.String(),
        name: t.String(),
        slug: t.String(),
        created_at: dateTime,
        subscription_status: t.Nullable(t.String()),
        referred_at: dateTime,
      })
    ),
  },
  { $id: "AdminAffiliateLinkDetail" }
)

const nameField = t.String({ minLength: 1, maxLength: MAX_NAME_LENGTH })

const freeMonthsField = t.Integer({
  minimum: 0,
  maximum: AFFILIATE_MAX_FREE_MONTHS,
})

const seatsField = t.Integer({ minimum: MIN_SEATS, maximum: MAX_SEATS })

export const adminAffiliateLinkBody = t.Object({
  name: nameField,
  code: t.Optional(t.String({ pattern: AFFILIATE_CODE_RE.source })),
  free_months: freeMonthsField,
  seats: t.Optional(seatsField),
})

export const adminAffiliateLinkPatchBody = t.Object({
  disabled: t.Optional(t.Boolean()),
  name: t.Optional(nameField),
  free_months: t.Optional(freeMonthsField),
  seats: t.Optional(seatsField),
  partner_name: t.Optional(
    t.Nullable(t.String({ maxLength: AFFILIATE_PARTNER_NAME_MAX_LENGTH }))
  ),
  partner_email: t.Optional(t.Nullable(emailSchema)),
  notes: t.Optional(
    t.Nullable(t.String({ maxLength: AFFILIATE_NOTES_MAX_LENGTH }))
  ),
})
