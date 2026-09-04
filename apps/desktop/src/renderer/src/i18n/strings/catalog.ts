export const catalog = {
  en: {
    "catalog.blocked.arch":
      "This module does not exist for the {arch} architecture.",
    "catalog.blocked.conflict":
      "In conflict with « {name} », already selected.",
    "catalog.blocked.installed": "Already installed on this server.",
    "catalog.category.ai": "AI agents",
    "catalog.category.core": "Core",
    "catalog.category.database": "Databases",
    "catalog.category.editor": "Remote editors",
    "catalog.category.exposure": "Exposure",
    "catalog.category.runtime": "Runtimes",
    "catalog.category.tool": "Tools",
    "catalog.module.disk": "{mb} MB disk",
    "catalog.module.ram": "{mb} MB memory",
    "catalog.presets.title": "To get started",
    "catalog.resources.diskHas": "of {gb} GB free",
    "catalog.resources.diskLabel": "Disk requested",
    "catalog.resources.megabytes": "{mb} MB",
    "catalog.resources.ramHas": "of {mb} MB",
    "catalog.resources.ramLabel": "Memory requested",
    "catalog.resources.unmeasured": "machine not measured",
    "catalog.screen.configure": "Configure {count} modules",
    "catalog.screen.defaultServer": "This server",
    "catalog.screen.description":
      "The catalogue is this server's agent's own: what it declares is what shows.",
    "catalog.screen.eyebrow": "Services",
    "catalog.screen.reload": "Reload",
    "catalog.screen.waitingDetail":
      "Available modules, dependencies, conflicts, requested resources, presets.",
    "catalog.screen.waitingTitle": "Reading the catalogue",
    "catalog.warning.disk":
      "The chosen modules ask for {asked} GB of disk; {has} remain on this machine.",
    "catalog.warning.ram":
      "The chosen modules ask for {asked} MB of memory; this machine has {has}.",
  },
  fr: {
    "catalog.blocked.arch":
      "Ce module n'existe pas pour l'architecture {arch}.",
    "catalog.blocked.conflict": "En conflit avec « {name} », déjà sélectionné.",
    "catalog.blocked.installed": "Déjà installé sur ce serveur.",
    "catalog.category.ai": "Agents IA",
    "catalog.category.core": "Socle",
    "catalog.category.database": "Bases de données",
    "catalog.category.editor": "Éditeurs distants",
    "catalog.category.exposure": "Exposition",
    "catalog.category.runtime": "Runtimes",
    "catalog.category.tool": "Outils",
    "catalog.module.disk": "{mb} Mo de disque",
    "catalog.module.ram": "{mb} Mo de mémoire",
    "catalog.presets.title": "Pour commencer",
    "catalog.resources.diskHas": "sur {gb} Go libres",
    "catalog.resources.diskLabel": "Disque demandé",
    "catalog.resources.megabytes": "{mb} Mo",
    "catalog.resources.ramHas": "sur {mb} Mo",
    "catalog.resources.ramLabel": "Mémoire demandée",
    "catalog.resources.unmeasured": "machine non mesurée",
    "catalog.screen.configure": "Configurer {count} modules",
    "catalog.screen.defaultServer": "Ce serveur",
    "catalog.screen.description":
      "Le catalogue est celui de l'agent de ce serveur : ce qu'il déclare est ce qui s'affiche.",
    "catalog.screen.eyebrow": "Services",
    "catalog.screen.reload": "Relancer",
    "catalog.screen.waitingDetail":
      "Modules disponibles, dépendances, conflits, ressources demandées, préréglages.",
    "catalog.screen.waitingTitle": "Lecture du catalogue",
    "catalog.warning.disk":
      "Les modules choisis demandent {asked} Go de disque ; il en reste {has} sur cette machine.",
    "catalog.warning.ram":
      "Les modules choisis demandent {asked} Mo de mémoire ; cette machine en a {has}.",
  },
} as const;
