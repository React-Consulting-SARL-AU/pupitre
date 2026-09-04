import { z } from "zod"

export const signInSchema = z.object({
  email: z.email("Entrez une adresse email valide."),
})

export type SignInInput = z.infer<typeof signInSchema>

export const deviceCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.toUpperCase().replaceAll(/[^A-Z0-9]/g, ""))
    .refine((value) => value.length === 8, "Le code compte huit caractères."),
})

export type DeviceCodeInput = z.infer<typeof deviceCodeSchema>
