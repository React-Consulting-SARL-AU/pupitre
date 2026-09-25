import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { readAgentState, recordHeartbeat } from "../../../servers/agent-state"
import { SshAddressInvalidError } from "../../../servers/ssh-address"
import { apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireServer } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { describeMalformedBodyField } from "../../validation-errors"
import { agentStateSchema, heartbeatBody } from "./schemas"

export const agentStateRoutes = new Elysia({ name: "agent-state-routes" })
  .use(requireServer)
  .get(
    "/agent/state",
    async ({ currentServer }) =>
      serializeData(await readAgentState(currentServer)),
    {
      detail: { summary: "L'état que l'agent lit toutes les 30 secondes" },
      response: { 200: agentStateSchema, 401: errorResponse },
    }
  )
  .post(
    "/agent/heartbeat",
    async ({ currentServer, body, request, set }) => {
      try {
        await recordHeartbeat(currentServer, body)
      } catch (error) {
        if (!(error instanceof SshAddressInvalidError)) {
          throw error
        }

        const { message, fix } = describeMalformedBodyField(
          error.field,
          resolveLocale(request.headers)
        )

        set.status = 422
        return apiError("validation", message, fix)
      }

      set.status = 204
    },
    {
      body: heartbeatBody,
      detail: { summary: "Le heartbeat de l'agent et ses métriques" },
      response: { 204: t.Void(), 401: errorResponse, 422: errorResponse },
    }
  )
