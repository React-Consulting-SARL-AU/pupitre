import { z } from "zod"
import type { Translate } from "@/lib/i18n/i18n"

export const MAX_NAME_LENGTH = 80

export function profileSchema(t: Translate) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("validation.name"))
      .max(
        MAX_NAME_LENGTH,
        t("validation.nameTooLong", { max: MAX_NAME_LENGTH })
      ),
  })
}

export type ProfileInput = z.infer<ReturnType<typeof profileSchema>>
