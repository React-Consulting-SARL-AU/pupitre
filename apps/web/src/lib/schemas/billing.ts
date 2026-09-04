import { z } from "zod"
import { BILLING_INTERVALS } from "@/lib/domain/billing"

export const MIN_SEATS = 1
export const MAX_SEATS = 500

export const checkoutSchema = z.object({
  quantity: z.coerce
    .number({ error: "Indiquez un nombre de serveurs." })
    .int("Un nombre entier de serveurs.")
    .min(MIN_SEATS, `Au moins ${MIN_SEATS} serveur.`)
    .max(MAX_SEATS, `Au plus ${MAX_SEATS} serveurs.`),
  interval: z.enum(BILLING_INTERVALS),
})

export type CheckoutInput = z.input<typeof checkoutSchema>

export type CheckoutValues = z.output<typeof checkoutSchema>
