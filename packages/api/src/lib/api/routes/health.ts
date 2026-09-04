import { Elysia, t } from "elysia"

export const healthRoutes = new Elysia({
  name: "health-routes",
  tags: ["Health"],
}).get("/health", () => ({ ok: true as const }), {
  detail: { summary: "L'API répond" },
  response: { 200: t.Object({ ok: t.Literal(true) }) },
})
