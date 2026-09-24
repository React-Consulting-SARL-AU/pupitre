import { Elysia } from "elysia"
import { backupsForgetRoutes } from "./forget"
import { backupsListRoutes } from "./list"

export const backupsRoutes = new Elysia({
  name: "backups-routes",
  tags: ["Backups"],
})
  .use(backupsListRoutes)
  .use(backupsForgetRoutes)
