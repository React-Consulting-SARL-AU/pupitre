import { type AnyElysia, Elysia } from "elysia"
import { authPlugin } from "../plugins/auth"
import { adminReleasesRoutes } from "./admin/releases"
import { agentRoutes } from "./agent"
import { devicesRoutes } from "./devices"
import { healthRoutes } from "./health"
import { meRoutes } from "./me"
import { orgsRoutes } from "./orgs"
import { releasesRoutes } from "./releases"
import { serversRoutes } from "./servers"
import { webhooksRoutes } from "./webhooks"

export function hiddenRoutes<Routes extends AnyElysia>(routes: Routes) {
  return new Elysia().guard({ detail: { hide: true } }).use(routes)
}

const adminRoutes = hiddenRoutes(
  new Elysia({ name: "admin-routes", prefix: "/admin" }).use(
    adminReleasesRoutes
  )
)

export const routes = new Elysia({ name: "routes" })
  .use(authPlugin)
  .use(healthRoutes)
  .use(meRoutes)
  .use(devicesRoutes)
  .use(serversRoutes)
  .use(orgsRoutes)
  .use(agentRoutes)
  .use(releasesRoutes)
  .use(webhooksRoutes)
  .use(adminRoutes)
