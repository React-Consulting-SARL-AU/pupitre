import { Elysia } from "elysia"
import { orgsBillingRoutes } from "./billing"
import { orgsEventsRoutes } from "./events"
import { orgsInvitationsRoutes, orgsMembersRoutes } from "./members"

export const orgsRoutes = new Elysia({
  name: "orgs-routes",
  prefix: "/orgs",
  tags: ["Organisation"],
})
  .use(orgsMembersRoutes)
  .use(orgsInvitationsRoutes)
  .use(orgsEventsRoutes)
  .use(orgsBillingRoutes)
