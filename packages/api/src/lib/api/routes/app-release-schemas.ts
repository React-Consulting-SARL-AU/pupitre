import { ReleaseChannel } from "@pupitre/db/cloudflare/enums"
import {
  DESKTOP_ARCHITECTURES,
  DESKTOP_SYSTEMS,
  FORMAT_PATTERN,
  MAX_ARTEFACT_BYTES,
  MAX_NOTES_LENGTH,
  MAX_SIGNATURE_LENGTH,
  MAX_URL_LENGTH,
  MAX_VERSION_LENGTH,
  SEMVER_PATTERN,
  SHA256_PATTERN,
} from "@pupitre/shared/releases"
import { t } from "elysia"
import { dateTime } from "../openapi-models"
import { RELEASE_CHANNELS, releaseChannelSchema } from "./servers/schemas"

const publishedChannelSchema = t.UnionEnum([...RELEASE_CHANNELS], {
  default: ReleaseChannel.beta,
})

const requestedChannelSchema = t.UnionEnum([...RELEASE_CHANNELS], {
  default: ReleaseChannel.stable,
})

export const desktopSystemSchema = t.UnionEnum([...DESKTOP_SYSTEMS])

export const desktopArchitectureSchema = t.UnionEnum([...DESKTOP_ARCHITECTURES])

export const appReleasePublishBody = t.Object({
  version: t.String({ pattern: SEMVER_PATTERN, maxLength: MAX_VERSION_LENGTH }),
  os: desktopSystemSchema,
  arch: desktopArchitectureSchema,
  format: t.String({ pattern: FORMAT_PATTERN }),
  url: t.String({ format: "uri", minLength: 1, maxLength: MAX_URL_LENGTH }),
  bytes: t.Integer({ minimum: 1, maximum: MAX_ARTEFACT_BYTES }),
  sha256: t.String({ pattern: SHA256_PATTERN }),
  signature: t.Optional(
    t.String({ minLength: 1, maxLength: MAX_SIGNATURE_LENGTH })
  ),
  notes: t.String({ minLength: 1, maxLength: MAX_NOTES_LENGTH }),
  channel: t.Optional(publishedChannelSchema),
})

export const appBuildSchema = t.Object(
  {
    os: desktopSystemSchema,
    arch: desktopArchitectureSchema,
    format: t.String(),
    url: t.String(),
    bytes: t.Integer(),
    sha256: t.String(),
    signature: t.Nullable(t.String()),
  },
  { $id: "AppBuild" }
)

export const appReleaseSchema = t.Object(
  {
    version: t.String(),
    channel: releaseChannelSchema,
    notes: t.String(),
    published_at: dateTime,
    builds: t.Array(appBuildSchema),
  },
  { $id: "AppRelease" }
)

export const appReleaseBuildSchema = t.Object(
  {
    version: t.String(),
    os: desktopSystemSchema,
    arch: desktopArchitectureSchema,
    format: t.String(),
    url: t.String(),
    bytes: t.Integer(),
    sha256: t.String(),
    signature: t.Nullable(t.String()),
    notes: t.String(),
    channel: releaseChannelSchema,
    published_at: dateTime,
  },
  { $id: "AppReleaseBuild" }
)

export const appReleaseVersionParams = t.Object({
  version: t.String({ minLength: 1, maxLength: MAX_VERSION_LENGTH }),
})

export const latestAppReleaseQuery = t.Object({
  channel: t.Optional(requestedChannelSchema),
})

export const appReleaseListQuery = t.Object({
  channel: t.Optional(requestedChannelSchema),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 50, default: 10 })),
})

export const appReleasePromoteBody = t.Object({
  channel: t.UnionEnum([...RELEASE_CHANNELS]),
})

export const appReleaseBuildParams = t.Object({
  version: t.String({ minLength: 1, maxLength: MAX_VERSION_LENGTH }),
  os: desktopSystemSchema,
  arch: desktopArchitectureSchema,
})
