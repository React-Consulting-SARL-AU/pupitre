import {
  AgentExchangeSchema,
  AgentStateSchema,
  HeartbeatSchema,
  ServerTokenSchema,
} from "@pupitre/shared/platform-api/agent"
import { fromContract } from "../../contract-schema"

export const exchangeBody = fromContract(AgentExchangeSchema)

export const serverTokenSchema = fromContract(ServerTokenSchema, {
  $id: "AgentServerToken",
})

export const agentStateSchema = fromContract(AgentStateSchema, {
  $id: "AgentState",
})

export const heartbeatBody = fromContract(HeartbeatSchema)
