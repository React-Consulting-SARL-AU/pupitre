import type { OperatingSystem } from "./releases"

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
