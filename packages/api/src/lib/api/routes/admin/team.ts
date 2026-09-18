import { Elysia, t } from "elysia"
import { listPlatformTeam } from "../../../platform/team"
import { errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { adminTeamMemberSchema } from "./platform-schemas"

export const adminTeamRoutes = new Elysia({ name: "admin-team-routes" })
  .use(requirePlatformAdmin)
  .get(
    "/team",
    async () => ({ data: serializeData(await listPlatformTeam()) }),
    {
      detail: { summary: "Les membres de l'organisation Pupitre" },
      response: {
        200: t.Object(
          { data: t.Array(adminTeamMemberSchema) },
          { $id: "AdminTeamList" }
        ),
        401: errorResponse,
        403: errorResponse,
      },
    }
  )
