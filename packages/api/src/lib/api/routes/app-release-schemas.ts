import { ReleaseChannel } from "@pupitre/db/cloudflare/enums"
import {
  AppReleaseBuildSchema,
  AppReleasePublishSchema,
  AppReleaseSchema,
  DESKTOP_ARCHITECTURES,
  DESKTOP_SYSTEMS,
  MAX_VERSION_LENGTH,
  RELEASE_CHANNELS,
} from "@pupitre/shared/releases"
import { t } from "elysia"
import { fromContract } from "../contract-schema"

const requestedChannelSchema = t.UnionEnum([...RELEASE_CHANNELS], {
  default: ReleaseChannel.stable,
})

export const appReleasePublishBody = fromContract(AppReleasePublishSchema)

export const appReleaseSchema = fromContract(AppReleaseSchema, {
  $id: "AppRelease",
})

export const appReleaseBuildSchema = fromContract(AppReleaseBuildSchema, {
  $id: "AppReleaseBuild",
})

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
  os: t.UnionEnum([...DESKTOP_SYSTEMS]),
  arch: t.UnionEnum([...DESKTOP_ARCHITECTURES]),
})

export const appReleaseBuildQuery = t.Object({
  format: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
})
