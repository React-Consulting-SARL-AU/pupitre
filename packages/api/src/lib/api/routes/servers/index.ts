import { Elysia } from "elysia"
import { enrollRoutes } from "./enroll"
import { serversListRoutes } from "./list"
import { serversRemoveRoutes } from "./remove"

export const serversRoutes = new Elysia({
  name: "servers-routes",
  tags: ["Servers"],
})
  .use(enrollRoutes)
  .use(serversListRoutes)
  .use(serversRemoveRoutes)
