import type { Release } from "@pupitre/db/cloudflare/client"
import type { Locale } from "../../i18n"
import { translate } from "../../i18n"
import {
  RELEASE_URL_TTL_SECONDS,
  releaseDownloadUrl,
} from "../../releases/releases"

export const RELEASE_STORAGE_HEADER = "x-pupitre-release-storage"

export interface ReleaseRedirect {
  headers: Record<string, string>
  body: string
}

export async function releaseRedirect(
  release: Release,
  locale: Locale
): Promise<ReleaseRedirect> {
  const { url, storage } = await releaseDownloadUrl(release)

  return {
    headers: {
      location: url,
      [RELEASE_STORAGE_HEADER]: storage,
      "cache-control": "no-store",
    },
    body:
      storage === "local"
        ? translate(locale, "release_url_local")
        : translate(locale, "release_url_signed", {
            seconds: RELEASE_URL_TTL_SECONDS,
          }),
  }
}
