import {
  AFFILIATE_CODE_RE,
  AFFILIATE_MAX_FREE_MONTHS,
} from "@pupitre/shared/plans"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"
import { MAX_SEATS, MIN_SEATS } from "../orgs/schemas"

const adminAffiliateLinkFields = {
  id: t.String(),
  code: t.String(),
  name: t.String(),
  free_months: t.Integer(),
  seats: t.Integer(),
  disabled: t.Boolean(),
  created_at: dateTime,
  referrals: t.Integer(),
  url: t.String(),
}

export const adminAffiliateLinkSchema = t.Object(adminAffiliateLinkFields, {
  $id: "AdminAffiliateLink",
})

export const adminAffiliateLinkDetailSchema = t.Object(
  {
    ...adminAffiliateLinkFields,
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

export const adminAffiliateLinkBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 80 }),
  code: t.Optional(t.String({ pattern: AFFILIATE_CODE_RE.source })),
  free_months: t.Integer({ minimum: 0, maximum: AFFILIATE_MAX_FREE_MONTHS }),
  seats: t.Optional(t.Integer({ minimum: MIN_SEATS, maximum: MAX_SEATS })),
})

export const adminAffiliateLinkPatchBody = t.Object({
  disabled: t.Boolean(),
})
