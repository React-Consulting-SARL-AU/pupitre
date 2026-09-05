import type { Architecture, OperatingSystem } from "./releases"

export interface PlatformHints {
  userAgent: string
  platform?: string
}

export function detectOs({
  userAgent,
  platform,
}: PlatformHints): OperatingSystem | null {
  const haystack = `${platform ?? ""} ${userAgent}`.toLowerCase()

  if (haystack.includes("android")) {
    return null
  }

  if (haystack.includes("win")) {
    return "windows"
  }

  if (haystack.includes("mac") || haystack.includes("iphone")) {
    return "macos"
  }

  if (haystack.includes("linux") || haystack.includes("x11")) {
    return "linux"
  }

  return null
}

export function detectArch({
  userAgent,
  platform,
}: PlatformHints): Architecture | null {
  const haystack = `${platform ?? ""} ${userAgent}`.toLowerCase()

  if (haystack.includes("arm64") || haystack.includes("aarch64")) {
    return "arm64"
  }

  if (haystack.includes("x86_64") || haystack.includes("win64")) {
    return "x64"
  }

  return null
}
