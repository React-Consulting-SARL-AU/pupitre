import { z } from "zod"
import type { Translate } from "@/lib/i18n/i18n"

const USER_CODE_LENGTH = 8

export function signInSchema(t: Translate) {
  return z.object({ email: z.email(t("validation.email")) })
}

export type SignInInput = z.infer<ReturnType<typeof signInSchema>>

export function deviceCodeSchema(t: Translate) {
  return z.object({
    code: z
      .string()
      .transform((value) => value.toUpperCase().replaceAll(/[^A-Z0-9]/g, ""))
      .refine(
        (value) => value.length === USER_CODE_LENGTH,
        t("validation.deviceCode")
      ),
  })
}

export type DeviceCodeInput = z.infer<ReturnType<typeof deviceCodeSchema>>
