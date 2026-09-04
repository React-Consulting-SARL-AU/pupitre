import { DESKTOP_SYSTEMS, type DesktopSystem } from "@pupitre/shared/releases"

export interface DesktopTarget {
  os: DesktopSystem
  label: string
  requirement: string
  format: string
}

const TARGETS: Record<DesktopSystem, DesktopTarget> = {
  macos: {
    os: "macos",
    label: "macOS",
    requirement: "macOS 13 ou plus récent",
    format: "Image disque signée et notarisée",
  },
  windows: {
    os: "windows",
    label: "Windows",
    requirement: "Windows 11",
    format: "Installateur signé",
  },
  linux: {
    os: "linux",
    label: "Linux",
    requirement: "Ubuntu 22.04 ou plus récent",
    format: "AppImage",
  },
}

export const APP_REQUIREMENTS: readonly DesktopTarget[] = DESKTOP_SYSTEMS.map(
  (os) => TARGETS[os]
)

export const SERVER_REQUIREMENTS: readonly string[] = [
  "Un VPS sous Ubuntu 22.04 ou 24.04, en 64 bits.",
  "4 Go de mémoire au minimum, 2 cœurs, 40 Go de disque.",
  "Un accès SSH avec les droits d'administration, le temps de l'installation.",
]

const MACOS_RE = /mac os x|macintosh/i
const WINDOWS_RE = /windows nt/i
const LINUX_RE = /linux|x11/i
const MOBILE_RE = /android|iphone|ipad|ipod/i

export function detectOs(userAgent: string): DesktopSystem | null {
  if (MOBILE_RE.test(userAgent)) {
    return null
  }

  if (MACOS_RE.test(userAgent)) {
    return "macos"
  }

  if (WINDOWS_RE.test(userAgent)) {
    return "windows"
  }

  return LINUX_RE.test(userAgent) ? "linux" : null
}

export interface PublishedBuild {
  os: string
  arch: string | null
  url: string
}

export interface PublishedAppRelease {
  version: string
  notes: string
  builds: PublishedBuild[]
}

export interface DownloadOffer extends DesktopTarget {
  url: string | null
  arch: string | null
}

export function downloadOffers(
  release: PublishedAppRelease | null
): DownloadOffer[] {
  return DESKTOP_SYSTEMS.map((os) => {
    const build = release?.builds.find((candidate) => candidate.os === os)

    return {
      ...TARGETS[os],
      url: build?.url ?? null,
      arch: build?.arch ?? null,
    }
  })
}
