import type { Server } from "@pupitre/db/cloudflare/client"

/** A server as the hot paths read it: everything but the seven-day metrics window. */
export type ServerRow = Omit<Server, "metrics">

export const WITHOUT_METRICS = { metrics: true } as const
