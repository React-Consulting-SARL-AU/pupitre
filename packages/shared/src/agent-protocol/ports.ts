import { z } from "zod"

export const PortSchema = z.int().min(1).max(65_535)

export type Port = z.infer<typeof PortSchema>
