import { z } from "zod"
import { ArchitectureSchema } from "../catalog"

export const SEMVER_PATTERN =
  "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"

export const SHA256_PATTERN = "^[0-9a-f]{64}$"

export const MAX_VERSION_LENGTH = 64

export const MAX_URL_LENGTH = 2048

export const MAX_NOTES_LENGTH = 20_000

export const MAX_SIGNATURE_LENGTH = 512

export const RELEASE_CHANNELS = ["stable", "beta"] as const

export const ReleaseChannelSchema = z.enum(RELEASE_CHANNELS)

export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>

export const DESKTOP_SYSTEMS = ["macos", "windows", "linux"] as const

export const DesktopSystemSchema = z.enum(DESKTOP_SYSTEMS)

export type DesktopSystem = z.infer<typeof DesktopSystemSchema>

export const VersionSchema = z
  .string()
  .max(MAX_VERSION_LENGTH)
  .regex(new RegExp(SEMVER_PATTERN))

export const AppReleasePublishSchema = z.object({
  version: VersionSchema,
  os: DesktopSystemSchema,
  arch: ArchitectureSchema.optional(),
  url: z.url().max(MAX_URL_LENGTH),
  sha256: z.string().regex(new RegExp(SHA256_PATTERN)),
  signature: z.string().min(1).max(MAX_SIGNATURE_LENGTH).optional(),
  notes: z.string().min(1).max(MAX_NOTES_LENGTH),
  channel: ReleaseChannelSchema.optional(),
})

export type AppReleasePublish = z.infer<typeof AppReleasePublishSchema>

export const AppBuildSchema = z.object({
  os: DesktopSystemSchema,
  arch: ArchitectureSchema.nullable(),
  url: z.string(),
  sha256: z.string(),
  signature: z.string().nullable(),
})

export type AppBuild = z.infer<typeof AppBuildSchema>

export const AppReleaseSchema = z.object({
  version: z.string(),
  channel: ReleaseChannelSchema,
  notes: z.string(),
  published_at: z.iso.datetime(),
  builds: z.array(AppBuildSchema),
})

export type AppRelease = z.infer<typeof AppReleaseSchema>
