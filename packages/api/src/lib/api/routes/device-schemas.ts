import { DeviceSchema } from "@pupitre/shared/platform-api/account"
import { t } from "elysia"
import { fromContract } from "../contract-schema"

const NAME_MAX_LENGTH = 80
const PUBLIC_KEY_MAX_LENGTH = 4096

export const deviceSchema = fromContract(DeviceSchema, { $id: "Device" })

export const deviceInputBody = t.Object({
  name: t.String({ minLength: 1, maxLength: NAME_MAX_LENGTH }),
  public_key: t.String({ minLength: 1, maxLength: PUBLIC_KEY_MAX_LENGTH }),
})
