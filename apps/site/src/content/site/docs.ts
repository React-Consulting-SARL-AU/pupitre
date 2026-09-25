import { MODULE_CATEGORIES, MODULE_IDS } from "@pupitre/shared/catalog"
import { fill, type Locale, type Localized } from "../../lib/i18n"

export const DOCS_SECTIONS = ["start", "services", "daily", "account"] as const

export type DocsSectionId = (typeof DOCS_SECTIONS)[number]

export interface DocsSectionMeta {
  title: Localized
  lead: Localized
}

export const DOCS_SECTION_META: Record<DocsSectionId, DocsSectionMeta> = {
  start: {
    title: { en: "Get started", fr: "Démarrer" },
    lead: {
      en: "From an empty VPS to a project served behind a URL.",
      fr: "D’un VPS vide à un projet servi derrière une URL.",
    },
  },
  services: {
    title: { en: "Services", fr: "Services" },
    lead: {
      en: "What every module of the catalogue installs, and what it asks you for.",
      fr: "Ce que chaque module du catalogue installe, et ce qu’il vous demande.",
    },
  },
  daily: {
    title: { en: "Every day", fr: "Au quotidien" },
    lead: {
      en: "Projects, terminals, agents and editors once the machine is up.",
      fr: "Projets, terminaux, agents et éditeurs une fois la machine prête.",
    },
  },
  account: {
    title: { en: "Account", fr: "Compte" },
    lead: {
      en: "Teams, billing, security, the questions that come back, troubleshooting and uninstalling.",
      fr: "Équipes, facturation, sécurité, les questions qui reviennent, le dépannage et la désinstallation.",
    },
  },
}

export interface ModulePageLabels {
  installs: Localized
  asks: Localized
  notes: Localized
  category: Localized
  moduleId: Localized
  none: Localized
  overviewTitle: Localized
  overviewLead: Localized
  backToServices: Localized
}

export const MODULE_LABELS: ModulePageLabels = {
  installs: { en: "What it installs", fr: "Ce qu’il installe" },
  asks: { en: "What it asks you for", fr: "Ce qu’il vous demande" },
  notes: { en: "Good to know", fr: "Bon à savoir" },
  category: { en: "Category", fr: "Catégorie" },
  moduleId: { en: "Module", fr: "Module" },
  none: {
    en: "Nothing. It installs as it is.",
    fr: "Rien. Il s’installe tel quel.",
  },
  overviewTitle: { en: "The catalogue", fr: "Le catalogue" },
  overviewLead: {
    en: "{count} modules across {categories} categories. Each one knows how to install itself, check itself, configure itself, update itself, uninstall itself and report its state, on Ubuntu 22.04 and 24.04, amd64 and arm64.",
    fr: "{count} modules répartis en {categories} catégories. Chacun sait s’installer, se vérifier, se configurer, se mettre à jour, se désinstaller et rapporter son état, sur Ubuntu 22.04 et 24.04, amd64 et arm64.",
  },
  backToServices: { en: "All services", fr: "Tous les services" },
}

export function servicesOverviewLead(locale: Locale): string {
  return fill(MODULE_LABELS.overviewLead[locale], {
    count: MODULE_IDS.length,
    categories: MODULE_CATEGORIES.length,
  })
}

export function sectionTitle(id: DocsSectionId, locale: Locale): string {
  return DOCS_SECTION_META[id].title[locale]
}
