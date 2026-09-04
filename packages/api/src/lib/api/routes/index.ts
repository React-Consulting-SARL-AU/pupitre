import { type AnyElysia, Elysia } from "elysia"
import { authPlugin } from "../plugins/auth"
import { healthRoutes } from "./health"
import { meRoutes } from "./me"

export function hiddenRoutes<Routes extends AnyElysia>(routes: Routes) {
  return new Elysia().guard({ detail: { hide: true } }).use(routes)
}

const adminRoutes = hiddenRoutes(
  new Elysia({ name: "admin-routes", prefix: "/admin" })
)

export const routes = new Elysia({ name: "routes" })
  .use(authPlugin)
  .use(healthRoutes)
  .use(meRoutes)
  .use(adminRoutes)
