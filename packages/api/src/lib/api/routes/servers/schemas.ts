import {
  AlertKind,
  ReleaseChannel,
  ServerStatus,
} from "@pupitre/db/cloudflare/enums"
import { ARCHITECTURES } from "@pupitre/shared/catalog"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"

export const SERVER_STATUSES = [
  ServerStatus.enrolling,
  ServerStatus.active,
  ServerStatus.grace,
  ServerStatus.suspended,
  ServerStatus.revoked,
] as const

export const serverStatusSchema = t.UnionEnum([...SERVER_STATUSES])

export const RELEASE_CHANNELS = [
  ReleaseChannel.stable,
  ReleaseChannel.beta,
] as const

export const releaseChannelSchema = t.UnionEnum([...RELEASE_CHANNELS])

export const architectureSchema = t.UnionEnum([...ARCHITECTURES])

export const enrollBody = t.Object({
  device_id: t.String({ minLength: 1 }),
  host: t.String({ minLength: 1, maxLength: 253 }),
  port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
  ssh_user: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
  fingerprint: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  probe: t.Object(
    { arch: architectureSchema },
    { additionalProperties: true, $id: "EnrollmentProbe" }
  ),
})

export const enrollmentSchema = t.Object(
  {
    server_id: t.String(),
    enrollment_token: t.String(),
    release: t.Object({
      version: t.String(),
      url: t.String(),
      sha256: t.String(),
      signature: t.String(),
      channel: releaseChannelSchema,
    }),
  },
  { $id: "ServerEnrollment" }
)

export const serverUsageSchema = t.Object(
  {
    at: dateTime,
    disk: t.Number(),
    ram: t.Number(),
    load: t.Number(),
    disk_total_gb: t.Nullable(t.Number()),
    disk_free_gb: t.Nullable(t.Number()),
    ram_total_mb: t.Nullable(t.Number()),
    ram_used_mb: t.Nullable(t.Number()),
  },
  { $id: "ServerUsage" }
)

export const ALERT_KINDS = [
  AlertKind.server_unreachable,
  AlertKind.disk_high,
  AlertKind.agent_outdated,
  AlertKind.entitlement_grace,
] as const

export const alertKindSchema = t.UnionEnum([...ALERT_KINDS])

export const alertSchema = t.Object(
  {
    kind: alertKindSchema,
    first_seen_at: dateTime,
    notified_at: t.Nullable(dateTime),
  },
  { $id: "ServerAlert" }
)

export const serverFields = {
  id: t.String(),
  name: t.String(),
  host: t.Nullable(t.String()),
  port: t.Integer(),
  user: t.String(),
  arch: t.String(),
  status: serverStatusSchema,
  stale: t.Boolean(),
  agent_version: t.Nullable(t.String()),
  target_version: t.Nullable(t.String()),
  host_fingerprint: t.Nullable(t.String()),
  assigned_user_id: t.Nullable(t.String()),
  pending_assignment_email: t.Nullable(t.String()),
  last_heartbeat_at: t.Nullable(dateTime),
  entitlement_valid_until: t.Nullable(dateTime),
  decommission_at: t.Nullable(dateTime),
  usage: t.Nullable(serverUsageSchema),
  alerts: t.Array(alertSchema),
  created_at: dateTime,
}

export const serverSchema = t.Object(serverFields, { $id: "Server" })

export const metricSampleSchema = t.Object(
  {
    at: dateTime,
    disk: t.Number(),
    ram: t.Number(),
    load: t.Number(),
    sessions: t.Array(t.String()),
    stack_version: t.Nullable(t.String()),
    modules: t.Array(t.String()),
    disk_total_gb: t.Nullable(t.Number()),
    disk_free_gb: t.Nullable(t.Number()),
    ram_total_mb: t.Nullable(t.Number()),
    ram_used_mb: t.Nullable(t.Number()),
  },
  { $id: "ServerMetricSample" }
)

export const serverEventSchema = t.Object(
  {
    id: t.String(),
    action: t.String(),
    actor_user_id: t.Nullable(t.String()),
    payload: t.Unknown(),
    created_at: dateTime,
  },
  { $id: "ServerEvent" }
)

export const serverDetailSchema = t.Object(
  {
    ...serverFields,
    metrics: t.Array(metricSampleSchema),
    events: t.Array(serverEventSchema),
  },
  { $id: "ServerDetail" }
)

export const EMAIL_PATTERN = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"

export const emailSchema = t.String({
  minLength: 3,
  maxLength: 254,
  pattern: EMAIL_PATTERN,
})

export const assignBody = t.Union([
  t.Object({ user_id: t.String({ minLength: 1 }) }),
  t.Object({ invite_email: emailSchema }),
])

export const revokeDeviceBody = t.Object({
  device_id: t.String({ minLength: 1 }),
})
