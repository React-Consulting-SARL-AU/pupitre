import type { Server } from "@pupitre/db/cloudflare/client"

/** The full row: metrics live in their own table, so nothing heavy needs leaving out. */
export type ServerRow = Server
