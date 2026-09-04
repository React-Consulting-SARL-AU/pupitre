import { ReleaseChannel } from "@pupitre/db/cloudflare/enums"
import { ARCHITECTURES } from "@pupitre/shared/catalog"
import { t } from "elysia"
import { DEFAULT_ARCH } from "../../releases/releases"
import { SEMVER_PATTERN } from "../../releases/semver"
import { dateTime } from "../openapi-models"
import {
  architectureSchema,
  RELEASE_CHANNELS,
  releaseChannelSchema,
} from "./servers/schemas"

const publishedChannelSchema = t.UnionEnum([...RELEASE_CHANNELS], {
  default: ReleaseChannel.beta,
})

const requestedChannelSchema = t.UnionEnum([...RELEASE_CHANNELS], {
  default: ReleaseChannel.stable,
})

const requestedArchitectureSchema = t.UnionEnum([...ARCHITECTURES], {
  default: DEFAULT_ARCH,
})

const SHA256_PATTERN = "^[0-9a-f]{64}$"

const ED25519_SIGNATURE_PATTERN = "^[A-Za-z0-9+/]{86}==$"

const MAX_VERSION_LENGTH = 64

const MAX_R2_KEY_LENGTH = 400

export const releasePublishBody = t.Object({
  version: t.String({ pattern: SEMVER_PATTERN, maxLength: MAX_VERSION_LENGTH }),
  arch: architectureSchema,
  sha256: t.String({ pattern: SHA256_PATTERN }),
  signature: t.String({ pattern: ED25519_SIGNATURE_PATTERN }),
  r2_key: t.String({ minLength: 1, maxLength: MAX_R2_KEY_LENGTH }),
  channel: t.Optional(publishedChannelSchema),
})

export const releasePromoteBody = t.Object({ channel: releaseChannelSchema })

export const releaseSchema = t.Object(
  {
    version: t.String(),
    arch: t.String(),
    sha256: t.String(),
    signature: t.String(),
    r2_key: t.String(),
    channel: releaseChannelSchema,
    published_at: dateTime,
  },
  { $id: "Release" }
)

export const latestReleaseSchema = t.Object(
  {
    version: t.String(),
    arch: t.String(),
    sha256: t.String(),
    signature: t.String(),
  },
  { $id: "LatestRelease" }
)

export const releaseVersionParams = t.Object({
  version: t.String({ minLength: 1, maxLength: MAX_VERSION_LENGTH }),
})

export const releaseArchQuery = t.Object({
  arch: t.Optional(requestedArchitectureSchema),
})

export const latestReleaseQuery = t.Object({
  channel: t.Optional(requestedChannelSchema),
  arch: t.Optional(requestedArchitectureSchema),
})
