import { z } from "zod"

export const SEMVER_PATTERN =
  "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"

export const SHA256_PATTERN = "^[0-9a-f]{64}$"

export const MAX_VERSION_LENGTH = 64

export const MAX_R2_KEY_LENGTH = 400

// A key, never an address, so nothing published points elsewhere; the leading characters forbid `..` and `/`.
export const APP_R2_KEY_PATTERN =
  "^app/[0-9][0-9A-Za-z.+-]{0,63}/[0-9A-Za-z][0-9A-Za-z._-]{0,127}$"

const MAX_NOTES_LENGTH = 20_000

const MAX_SIGNATURE_LENGTH = 512

export const RELEASE_CHANNELS = ["stable", "beta"] as const

export const ReleaseChannelSchema = z.enum(RELEASE_CHANNELS)

export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>

export const DESKTOP_SYSTEMS = ["macos", "windows", "linux"] as const

// Electron and installers say `x64` where the agent catalogue says `amd64`: neither translates the other.
export const DESKTOP_ARCHITECTURES = ["arm64", "x64", "universal"] as const

const DesktopArchitectureSchema = z.enum(DESKTOP_ARCHITECTURES)

export type DesktopArchitecture = z.infer<typeof DesktopArchitectureSchema>

export const DesktopSystemSchema = z.enum(DESKTOP_SYSTEMS)

export type DesktopSystem = z.infer<typeof DesktopSystemSchema>

export const VersionSchema = z
  .string()
  .max(MAX_VERSION_LENGTH)
  .regex(new RegExp(SEMVER_PATTERN))

const FORMAT_PATTERN = "^[A-Za-z0-9]{2,16}$"

const MAX_ARTEFACT_BYTES = 4_000_000_000

export const AppReleasePublishSchema = z.object({
  version: VersionSchema,
  os: DesktopSystemSchema,
  arch: DesktopArchitectureSchema,
  format: z.string().regex(new RegExp(FORMAT_PATTERN)),
  r2_key: z
    .string()
    .max(MAX_R2_KEY_LENGTH)
    .regex(new RegExp(APP_R2_KEY_PATTERN)),
  bytes: z.int().positive().max(MAX_ARTEFACT_BYTES),
  sha256: z.string().regex(new RegExp(SHA256_PATTERN)),
  signature: z.string().min(1).max(MAX_SIGNATURE_LENGTH),
  notes: z.string().min(1).max(MAX_NOTES_LENGTH),
  channel: ReleaseChannelSchema.optional(),
})

const AppBuildSchema = z.object({
  os: DesktopSystemSchema,
  arch: DesktopArchitectureSchema,
  format: z.string(),
  url: z.string(),
  bytes: z.int(),
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

export const AppReleaseBuildSchema = AppBuildSchema.extend({
  version: z.string(),
  notes: z.string(),
  channel: ReleaseChannelSchema,
  published_at: z.iso.datetime(),
})

export type AppReleaseBuild = z.infer<typeof AppReleaseBuildSchema>
