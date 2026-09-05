import type { AppRelease } from "../../lib/releases"

/**
 * The last list the site was built with. A build that cannot reach the platform
 * publishes this and warns; it never publishes an empty download page.
 *
 * No asset carries a size or a digest: the repository cannot know them, and a
 * checksum that is not the file's is worse than no checksum at all.
 */
export const FALLBACK_RELEASES: AppRelease[] = [
  {
    version: "0.1.0",
    channel: "beta",
    published_at: "2026-09-01T00:00:00.000Z",
    assets: [
      {
        os: "macos",
        arch: "arm64",
        format: "dmg",
        url: "https://app.pupitre.studio/api/v1/releases/app/0.1.0/macos-arm64",
      },
      {
        os: "macos",
        arch: "x64",
        format: "dmg",
        url: "https://app.pupitre.studio/api/v1/releases/app/0.1.0/macos-x64",
      },
      {
        os: "windows",
        arch: "x64",
        format: "exe",
        url: "https://app.pupitre.studio/api/v1/releases/app/0.1.0/windows-x64",
      },
      {
        os: "linux",
        arch: "x64",
        format: "AppImage",
        url: "https://app.pupitre.studio/api/v1/releases/app/0.1.0/linux-x64",
      },
      {
        os: "linux",
        arch: "arm64",
        format: "AppImage",
        url: "https://app.pupitre.studio/api/v1/releases/app/0.1.0/linux-arm64",
      },
    ],
  },
]
