import { z } from "zod"

export const SEMVER_PATTERN =
  "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"

export const SHA256_PATTERN = "^[0-9a-f]{64}$"

export const MAX_VERSION_LENGTH = 64

export const MAX_R2_KEY_LENGTH = 400

/**
 * Where an artefact sits in the downloads bucket: `app/<version>/<file>`.
 *
 * A publication names a key, never an address: the platform composes the URL
 * from the bucket it owns, so nothing published can send a reader to a host
 * that is not ours. The version segment starts with a digit and the file name
 * with an alphanumeric, which is what forbids a `..` segment and a leading
 * slash — the two shapes that would escape the prefix.
 */
export const APP_R2_KEY_PATTERN =
  "^app/[0-9][0-9A-Za-z.+-]{0,63}/[0-9A-Za-z][0-9A-Za-z._-]{0,127}$"

export const MAX_NOTES_LENGTH = 20_000

export const MAX_SIGNATURE_LENGTH = 512

export const RELEASE_CHANNELS = ["stable", "beta"] as const

export const ReleaseChannelSchema = z.enum(RELEASE_CHANNELS)

export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>

export const DESKTOP_SYSTEMS = ["macos", "windows", "linux"] as const

/**
 * The app's architectures, which aren't a server's: an Intel Mac is `x64`
 * everywhere Electron, npm and installers name it, while the agent catalogue
 * calls the same chip `amd64`. Two vocabularies because two worlds, and
 * neither translates the other.
 */
export const DESKTOP_ARCHITECTURES = ["arm64", "x64", "universal"] as const

export const DesktopArchitectureSchema = z.enum(DESKTOP_ARCHITECTURES)

export type DesktopArchitecture = z.infer<typeof DesktopArchitectureSchema>

export const DesktopSystemSchema = z.enum(DESKTOP_SYSTEMS)

export type DesktopSystem = z.infer<typeof DesktopSystemSchema>

export const VersionSchema = z
  .string()
  .max(MAX_VERSION_LENGTH)
  .regex(new RegExp(SEMVER_PATTERN))

/** The artefact's extension, as the download page names it: dmg, exe, AppImage, deb. */
export const FORMAT_PATTERN = "^[A-Za-z0-9]{2,16}$"

export const MAX_ARTEFACT_BYTES = 4_000_000_000

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

export type AppReleasePublish = z.infer<typeof AppReleasePublishSchema>

export const AppBuildSchema = z.object({
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
