import { t } from "elysia"
import { dateTime } from "../openapi-models"

const NAME_MAX_LENGTH = 80
const PUBLIC_KEY_MAX_LENGTH = 4096

export const deviceSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    public_key: t.String(),
    fingerprint: t.String(),
    last_used_at: t.Nullable(dateTime),
    created_at: dateTime,
  },
  { $id: "Device" }
)

export const deviceInputBody = t.Object({
  name: t.String({ minLength: 1, maxLength: NAME_MAX_LENGTH }),
  public_key: t.String({ minLength: 1, maxLength: PUBLIC_KEY_MAX_LENGTH }),
})
