import { type AnyElysia, Elysia } from "elysia"
import { authPlugin } from "../plugins/auth"
import { adminAffiliateLinksRoutes } from "./admin/affiliate-links"
import { adminAppReleasesRoutes } from "./admin/app-releases"
import { adminEventsRoutes } from "./admin/events"
import { adminInboxRoutes } from "./admin/inbox"
import { adminOrganizationsRoutes } from "./admin/organizations"
import { adminOverviewRoutes } from "./admin/overview"
import { adminReleasesRoutes } from "./admin/releases"
import { adminSearchRoutes } from "./admin/search"
import { adminServersRoutes } from "./admin/servers"
import { adminSubscriptionsRoutes } from "./admin/subscriptions"
import { adminTeamRoutes } from "./admin/team"
import { adminUsersRoutes } from "./admin/users"
import { affiliateRoutes } from "./affiliate"
import { agentRoutes } from "./agent"
import { appReleasesRoutes } from "./app-releases"
import { backupsRoutes } from "./backups"
import { devicesRoutes } from "./devices"
import { healthRoutes } from "./health"
import { keyApprovalsRoutes } from "./key-approvals"
import { meRoutes, meServersRoutes } from "./me"
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
    .use(adminOverviewRoutes)
    .use(adminSearchRoutes)
    .use(adminUsersRoutes)
    .use(adminOrganizationsRoutes)
    .use(adminSubscriptionsRoutes)
    .use(adminEventsRoutes)
    .use(adminTeamRoutes)
    .use(adminAffiliateLinksRoutes)
    .use(adminInboxRoutes)
)

export const routes = new Elysia({ name: "routes" })
  .use(authPlugin)
  .use(healthRoutes)
  .use(statusRoutes)
  .use(meRoutes)
  .use(meServersRoutes)
  .use(devicesRoutes)
  .use(keyApprovalsRoutes)
  .use(serversRoutes)
  .use(backupsRoutes)
  .use(orgsRoutes)
  .use(agentRoutes)
  .use(releasesRoutes)
  .use(appReleasesRoutes)
  .use(affiliateRoutes)
  .use(webhooksRoutes)
  .use(adminRoutes)
