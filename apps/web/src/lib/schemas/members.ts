import { z } from "zod"
import { INVITABLE_ROLES } from "@/lib/domain/roles"

const email = z
  .string()
  .trim()
  .min(1, "Indiquez une adresse email.")
  .email("Cette adresse email est illisible.")
  .transform((value) => value.toLowerCase())

export const inviteSchema = z.object({
  email,
  role: z.enum(INVITABLE_ROLES as [string, ...string[]]),
})

export type InviteInput = z.input<typeof inviteSchema>

export type InviteValues = z.output<typeof inviteSchema>

export const assignByEmailSchema = z.object({ email })

export type AssignByEmailInput = z.input<typeof assignByEmailSchema>

export type AssignByEmailValues = z.output<typeof assignByEmailSchema>
