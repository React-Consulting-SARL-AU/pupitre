import { Elysia } from "elysia"
import { orgsBillingRoutes } from "./billing"

export const orgsRoutes = new Elysia({
  name: "orgs-routes",
  prefix: "/orgs",
  tags: ["Organisation"],
}).use(orgsBillingRoutes)
