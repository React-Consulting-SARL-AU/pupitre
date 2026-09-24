export const catalog = {
  en: {
    "catalog.blocked.arch":
      "This service does not exist for the {arch} architecture.",
    "catalog.blocked.conflict":
      "In conflict with « {name} », already selected.",
    "catalog.blocked.conflictInstalled":
      "In conflict with « {name} », already on this server: remove it first, from Services.",
    "catalog.blocked.installed": "Already installed on this server.",
    "catalog.category.ai": "AI agents",
    "catalog.category.core": "Core",
    "catalog.category.database": "Databases",
    "catalog.category.editor": "Remote editors",
    "catalog.category.exposure": "Exposure",
    "catalog.category.runtime": "Runtimes",
    "catalog.category.tool": "Tools",
    "catalog.presets.title": "To get started",
    "catalog.presets.chooses.one": "One service to choose",
    "catalog.presets.chooses.other": "One of {count} services to choose",
    "catalog.presets.coreOnly": "The core alone, nothing else.",
    "catalog.presets.nothing":
      "Everything it brings is already on this server.",
    "catalog.presets.chooseOne":
      "{preset} — one of these, they refuse each other",
    "catalog.presets.none": "None of them",
    "catalog.presets.noneDetail":
      "Take the rest of the preset and leave this choice out; you can make it later.",
    "catalog.presets.apply": "Apply the preset",
    "catalog.search.label": "Search the catalogue",
    "catalog.search.placeholder": "Search a service",
    "catalog.search.clear": "Clear the search",
    "catalog.search.found.one": "{count} service found",
    "catalog.search.found.other": "{count} services found",
    "catalog.search.emptyTitle": "No service matches « {query} ».",
    "catalog.search.emptyDetail":
      "Try the name of the software, or clear the search to see the whole catalogue.",
    "catalog.resources.line":
      "Memory {ram} of {ramHas} · Disk {disk} of {diskHas} free",
    "catalog.resources.unmeasured":
      "Memory {ram} · Disk {disk} — machine not measured yet",
    "catalog.screen.chosen.one": "1 service chosen",
    "catalog.screen.chosen.other": "{count} services chosen",
    "catalog.screen.configure.one": "Continue with 1 service",
    "catalog.screen.configure.other": "Continue with {count} services",
    "catalog.screen.defaultServer": "This server",
    "catalog.screen.title": "Services",
    "catalog.screen.reload": "Reload",
    "catalog.screen.waitingTitle": "Reading what this server can receive",
    "catalog.warning.disk":
      "The chosen services ask for {asked} GB of disk; {has} remain on this machine.",
    "catalog.warning.ram":
      "The chosen services ask for {asked} MB of memory; this machine has {has}.",
  },
  fr: {
    "catalog.blocked.arch":
      "Ce service n'existe pas pour l'architecture {arch}.",
    "catalog.blocked.conflict": "En conflit avec « {name} », déjà sélectionné.",
    "catalog.blocked.conflictInstalled":
      "En conflit avec « {name} », déjà sur ce serveur : retirez-le d'abord, depuis Services.",
    "catalog.blocked.installed": "Déjà installé sur ce serveur.",
    "catalog.category.ai": "Agents IA",
    "catalog.category.core": "Base",
    "catalog.category.database": "Bases de données",
    "catalog.category.editor": "Éditeurs distants",
    "catalog.category.exposure": "Exposition",
    "catalog.category.runtime": "Runtimes",
    "catalog.category.tool": "Outils",
    "catalog.presets.title": "Pour commencer",
    "catalog.presets.chooses.one": "Un service à choisir",
    "catalog.presets.chooses.other": "Un service à choisir parmi {count}",
    "catalog.presets.coreOnly": "La base seule, rien d'autre.",
    "catalog.presets.nothing": "Tout ce qu'il apporte est déjà sur ce serveur.",
    "catalog.presets.chooseOne":
      "{preset} — l'un de ceux-ci, ils se refusent l'un l'autre",
    "catalog.presets.none": "Aucun",
    "catalog.presets.noneDetail":
      "Prendre le reste du préréglage et laisser ce choix de côté ; il se fera plus tard.",
    "catalog.presets.apply": "Appliquer le préréglage",
    "catalog.search.label": "Chercher dans le catalogue",
    "catalog.search.placeholder": "Chercher un service",
    "catalog.search.clear": "Effacer la recherche",
    "catalog.search.found.one": "{count} service trouvé",
    "catalog.search.found.other": "{count} services trouvés",
    "catalog.search.emptyTitle": "Aucun service ne répond à « {query} ».",
    "catalog.search.emptyDetail":
      "Essayez le nom du logiciel, ou effacez la recherche pour revoir tout le catalogue.",
    "catalog.resources.line":
      "Mémoire {ram} sur {ramHas} · Disque {disk} sur {diskHas} libres",
    "catalog.resources.unmeasured":
      "Mémoire {ram} · Disque {disk} — machine pas encore mesurée",
    "catalog.screen.chosen.one": "1 service choisi",
    "catalog.screen.chosen.other": "{count} services choisis",
    "catalog.screen.configure.one": "Continuer avec 1 service",
    "catalog.screen.configure.other": "Continuer avec {count} services",
    "catalog.screen.defaultServer": "Ce serveur",
    "catalog.screen.title": "Services",
    "catalog.screen.reload": "Relancer",
    "catalog.screen.waitingTitle": "On lit ce que ce serveur peut recevoir",
    "catalog.warning.disk":
      "Les services choisis demandent {asked} Go de disque ; il en reste {has} sur cette machine.",
    "catalog.warning.ram":
      "Les services choisis demandent {asked} Mo de mémoire ; cette machine en a {has}.",
  },
} as const;
