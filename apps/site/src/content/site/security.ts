import type { Locale } from "../../lib/i18n"
import { securityEn } from "./security.en"
import { securityFr } from "./security.fr"

export interface Guarantee {
  statement: string
  proof: string
  check: string
}

export interface SecurityQuestion {
  id: string
  question: string
  paragraphs: string[]
  command?: string
  link?: { href: string; label: string }
}

export interface SecurityContent {
  meta: { title: string; description: string }
  hero: { label: string; headline: string; lead: string; cta: string }
  guarantees: {
    label: string
    title: string
    lead: string
    checkLabel: string
    items: Guarantee[]
  }
  platform: {
    label: string
    title: string
    knows: { title: string; items: string[] }
    never: { title: string; items: string[] }
  }
  questions: { label: string; title: string; items: SecurityQuestion[] }
  closing: {
    title: string
    body: string
    policy: string
    docs: string
  }
}

const SECURITY: Record<Locale, SecurityContent> = {
  en: securityEn,
  fr: securityFr,
}

export function securityContent(locale: Locale): SecurityContent {
  return SECURITY[locale]
}
