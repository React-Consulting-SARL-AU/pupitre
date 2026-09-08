import { z } from "zod"
import { BILLING_INTERVALS } from "@/lib/domain/billing"
import type { Translate } from "@/lib/i18n/i18n"

export const MIN_SEATS = 1
export const MAX_SEATS = 500

export function checkoutSchema(t: Translate) {
  return z.object({
    quantity: z.coerce
      .number({ error: t("validation.quantity") })
      .int(t("validation.quantityInteger"))
      .min(MIN_SEATS, t("validation.quantityMin", { min: MIN_SEATS }))
      .max(MAX_SEATS, t("validation.quantityMax", { max: MAX_SEATS })),
    interval: z.enum(BILLING_INTERVALS),
  })
}

export type CheckoutInput = z.input<ReturnType<typeof checkoutSchema>>

export type CheckoutValues = z.output<ReturnType<typeof checkoutSchema>>

export function seatsSchema(t: Translate, minimum: number = MIN_SEATS) {
  return z.object({
    quantity: z.coerce
      .number({ error: t("validation.quantity") })
      .int(t("validation.quantityInteger"))
      .min(minimum, t("validation.quantityMin", { min: minimum }))
      .max(MAX_SEATS, t("validation.quantityMax", { max: MAX_SEATS })),
  })
}

export type SeatsInput = z.input<ReturnType<typeof seatsSchema>>

export type SeatsValues = z.output<ReturnType<typeof seatsSchema>>
