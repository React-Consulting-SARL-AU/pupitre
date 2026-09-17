import { type AnyElysia, Elysia } from "elysia"
import { authPlugin } from "../plugins/auth"
import { adminAppReleasesRoutes } from "./admin/app-releases"
import { adminReleasesRoutes } from "./admin/releases"
import { adminServersRoutes } from "./admin/servers"
import { agentRoutes } from "./agent"
import { appReleasesRoutes } from "./app-releases"
import { devicesRoutes } from "./devices"
import { healthRoutes } from "./health"
import { meRoutes } from "./me"
import { orgsRoutes } from "./orgs"
import { releasesRoutes } from "./releases"
import { serversRoutes } from "./servers"
import { statusRoutes } from "./status"
import { webhooksRoutes } from "./webhooks"

export function hiddenRoutes<Routes extends AnyElysia>(routes: Routes) {
  return new Elysia().guard({ detail: { hide: true } }).use(routes)
}

const adminRoutes = hiddenRoutes(
  new Elysia({ name: "admin-routes", prefix: "/admin" })
    .use(adminReleasesRoutes)
    .use(adminAppReleasesRoutes)
    .use(adminServersRoutes)
)

export const routes = new Elysia({ name: "routes" })
  .use(authPlugin)
  .use(healthRoutes)
  .use(statusRoutes)
  .use(meRoutes)
  .use(devicesRoutes)
  .use(serversRoutes)
  .use(orgsRoutes)
  .use(agentRoutes)
  .use(releasesRoutes)
  .use(appReleasesRoutes)
  .use(webhooksRoutes)
  .use(adminRoutes)
