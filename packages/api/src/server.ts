import { Elysia } from "elysia"

export const app = new Elysia({ prefix: "/api/v1" }).get("/health", () => ({
  ok: true,
}))

export type Api = typeof app

export function handleApiRequest(request: Request): Promise<Response> {
  return Promise.resolve(app.handle(request))
}
