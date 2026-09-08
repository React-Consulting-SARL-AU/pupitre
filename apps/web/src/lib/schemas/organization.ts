import { z } from "zod"
import {
  MAX_ORGANIZATION_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  SLUG_RE,
} from "@/lib/domain/organization"
import type { Translate } from "@/lib/i18n/i18n"

function nameField(t: Translate) {
  return z
    .string()
    .trim()
    .min(1, t("validation.organizationName"))
    .max(
      MAX_ORGANIZATION_NAME_LENGTH,
      t("validation.nameTooLong", { max: MAX_ORGANIZATION_NAME_LENGTH })
    )
}

export function createOrganizationSchema(t: Translate) {
  return z.object({ name: nameField(t) })
}

export type CreateOrganizationInput = z.input<
  ReturnType<typeof createOrganizationSchema>
>

export type CreateOrganizationValues = z.output<
  ReturnType<typeof createOrganizationSchema>
>

export function organizationSchema(t: Translate) {
  return z.object({
    name: nameField(t),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, t("validation.slug"))
      .max(
        MAX_SLUG_LENGTH,
        t("validation.slugTooLong", { max: MAX_SLUG_LENGTH })
      )
      .regex(SLUG_RE, t("validation.slug")),
  })
}

export type OrganizationInput = z.input<ReturnType<typeof organizationSchema>>

export type OrganizationValues = z.output<ReturnType<typeof organizationSchema>>
