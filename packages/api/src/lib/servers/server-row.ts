import type { Server } from "@pupitre/db/cloudflare/client"

/**
 * A server as the hot paths read it: the window lives in its own rows, so the
 * row itself has nothing heavy left to leave out.
 */
export type ServerRow = Server
