import type { ModuleId } from "@pupitre/shared/catalog"
import type { Locale } from "../../lib/i18n"
import { homeEn } from "./home.en"
import { homeFr } from "./home.fr"

export interface FeatureItem {
  title: string
  lines: string[]
}

export interface ClaimItem {
  statement: string
  proof: string
}

export interface FaqItem {
  question: string
  answer: string
}

export interface StepItem {
  title: string
  detail: string
  duringLaunch?: { title: string; detail: string }
}

// `mark` names a product a module installs under another name, such as Bun inside `runtime.node`.
export interface StackItem {
  name: string
  module?: ModuleId
  mark?: string
}

export const STACK: readonly StackItem[] = [
  { name: "Claude Code", module: "ai.claude" },
  { name: "Codex", module: "ai.codex" },
  { name: "Hermes", module: "ai.hermes" },
  { name: "Node.js", module: "runtime.node" },
  { name: "Bun", mark: "bun" },
  { name: "Python", module: "runtime.python" },
  { name: "Java", module: "runtime.java" },
  { name: "PostgreSQL", module: "db.postgres" },
  { name: "MySQL", module: "db.mysql" },
  { name: "Redis", module: "db.redis" },
  { name: "Docker", module: "runtime.docker" },
  { name: "Cloudflare", module: "exposure.cloudflare" },
]

export interface HomeContent {
  meta: { title: string; description: string }
  hero: {
    eyebrow: string
    headline: string
    cooled: string
    lead: string
    signUp: string
    download: string
    note: string
  }
  stack: { title: string; lead: string; note: string; link: string }
  name: {
    label: string
    word: string
    pronunciation: string
    grammar: string
    senses: string[]
  }
  steps: { label: string; title: string; lead: string; items: StepItem[] }
  features: { label: string; title: string; items: FeatureItem[] }
  clients: {
    label: string
    title: string
    lead: string
    items: FeatureItem[]
    note: string
  }
  catalog: { label: string; title: string; lead: string }
  promise: { label: string; title: string; items: ClaimItem[] }
  faq: { label: string; title: string; items: FaqItem[] }
  pricing: {
    label: string
    title: string
    perServer: string
    annual: string
    trial: string
    launch: string
    hosted: string
    link: string
  }
  cta: { title: string; lead: string; signUp: string; docs: string }
}

const HOME: Record<Locale, HomeContent> = { en: homeEn, fr: homeFr }

export function homeContent(locale: Locale): HomeContent {
  return HOME[locale]
}
