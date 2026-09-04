import { Elysia } from "elysia"
import { agentExchangeRoutes } from "./exchange"
import { agentStateRoutes } from "./state"

export const agentRoutes = new Elysia({
  name: "agent-routes",
  tags: ["Agent"],
})
  .use(agentExchangeRoutes)
  .use(agentStateRoutes)
