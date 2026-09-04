import { z } from "zod"

export const MAX_NAME_LENGTH = 80

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Indiquez le nom qui vous représente.")
    .max(MAX_NAME_LENGTH, `Au plus ${MAX_NAME_LENGTH} caractères.`),
})

export type ProfileInput = z.infer<typeof profileSchema>
