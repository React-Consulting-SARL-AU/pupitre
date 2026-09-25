import { DESKTOP_SYSTEMS, type DesktopSystem } from "@pupitre/shared/releases"
import type { DictionaryKey } from "@/lib/i18n/en"

export interface DesktopTarget {
  os: DesktopSystem
  label: DictionaryKey
  requirement: DictionaryKey
  format: DictionaryKey
}

const TARGETS: Record<DesktopSystem, DesktopTarget> = {
  macos: {
    os: "macos",
    label: "download.os.macos",
    requirement: "download.requirement.macos",
    format: "download.format.macos",
  },
  windows: {
    os: "windows",
    label: "download.os.windows",
    requirement: "download.requirement.windows",
    format: "download.format.windows",
  },
  linux: {
    os: "linux",
    label: "download.os.linux",
    requirement: "download.requirement.linux",
    format: "download.format.linux",
  },
}

export const APP_REQUIREMENTS: readonly DesktopTarget[] = DESKTOP_SYSTEMS.map(
  (os) => TARGETS[os]
)

export const SERVER_REQUIREMENTS: readonly DictionaryKey[] = [
  "download.server.ubuntu",
  "download.server.memory",
  "download.server.ssh",
]

const MACOS_RE = /mac os x|macintosh/i
const WINDOWS_RE = /windows nt/i
const LINUX_RE = /linux|x11/i
const MOBILE_RE = /android|iphone|ipad|ipod/i

export type DetectedArch = "arm64" | "x64"

export interface MachineHints {
  architecture?: string
  bitness?: string
  renderer?: string
}

export interface Machine {
  os: DesktopSystem | null
  arch: DetectedArch | null
}

const APPLE_CHIP_RE = /\bapple m\d/i

// Safari says "Apple GPU" on every Mac, so only a named Apple chip decides; undecided gets every build.
export function detectArch(hints: MachineHints): DetectedArch | null {
  if (hints.architecture === "arm" && hints.bitness === "64") {
    return "arm64"
  }

  if (hints.architecture === "x86" && hints.bitness === "64") {
    return "x64"
  }

  return hints.renderer && APPLE_CHIP_RE.test(hints.renderer) ? "arm64" : null
}

export function isSuggested(offer: DownloadOffer, machine: Machine): boolean {
  return (
    offer.os === machine.os &&
    (machine.arch === null || offer.arch === machine.arch)
  )
}

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
  arch: string
  format: string
  url: string
}

// A system's usual format needs no label; Linux's second one does.
const FORMAT_LABELS: Record<string, DictionaryKey> = {
  deb: "download.format.deb",
}

export interface PublishedAppRelease {
  version: string
  channel: string
  notes: string
  builds: PublishedBuild[]
}

export interface DownloadOffer extends DesktopTarget {
  url: string | null
  arch: string | null
}

// One row per file, not per OS: Intel and Apple Silicon Macs need different `.dmg`s.
export function downloadOffers(
  release: PublishedAppRelease | null
): DownloadOffer[] {
  return DESKTOP_SYSTEMS.flatMap((os) => {
    const builds =
      release?.builds.filter((candidate) => candidate.os === os) ?? []

    if (builds.length === 0) {
      const empty: DownloadOffer = { ...TARGETS[os], arch: null, url: null }

      return [empty]
    }

    return builds.map<DownloadOffer>((build) => ({
      ...TARGETS[os],
      format: FORMAT_LABELS[build.format] ?? TARGETS[os].format,
      arch: build.arch,
      url: build.url,
    }))
  })
}
