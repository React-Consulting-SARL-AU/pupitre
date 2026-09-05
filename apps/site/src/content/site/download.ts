import type { Locale } from "../../lib/i18n"
import type { OperatingSystem } from "../../lib/releases"
import { downloadEn } from "./download.en"
import { downloadFr } from "./download.fr"

export interface RequirementBlock {
  title: string
  lines: string[]
}

export interface DownloadContent {
  meta: { title: string; description: string }
  hero: {
    label: string
    headline: string
    lead: string
    detecting: string
    unknown: string
  }
  account: { title: string; body: string; cta: string }
  os: Record<OperatingSystem, { name: string; note: string }>
  arch: Record<string, string>
  assets: {
    label: string
    title: string
    lead: string
    verify: string
    download: string
    size: string
    digest: string
    format: string
    empty: string
  }
  stale: { title: string; body: string }
  release: {
    label: string
    title: string
    version: string
    published: string
    channel: string
    changelog: string
  }
  requirements: {
    label: string
    title: string
    lead: string
    app: RequirementBlock
    server: RequirementBlock
  }
  install: { label: string; title: string; lead: string; steps: string[] }
}

const DOWNLOAD: Record<Locale, DownloadContent> = {
  en: downloadEn,
  fr: downloadFr,
}

export function downloadContent(locale: Locale): DownloadContent {
  return DOWNLOAD[locale]
}
