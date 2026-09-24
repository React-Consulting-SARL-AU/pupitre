import { Elysia } from "elysia"
import { agentBackupsRoutes } from "./backups"
import { agentExchangeRoutes } from "./exchange"
import { agentReleaseRoutes } from "./release"
import { agentStateRoutes } from "./state"

export const agentRoutes = new Elysia({
  name: "agent-routes",
  tags: ["Agent"],
})
  .use(agentExchangeRoutes)
  .use(agentStateRoutes)
  .use(agentReleaseRoutes)
  .use(agentBackupsRoutes)
