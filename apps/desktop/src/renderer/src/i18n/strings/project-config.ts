export const projectConfig = {
  en: {
    "project.tab.configuration": "Configuration",
    "project.config.sections": "Parts of the configuration",
    "project.config.part.general": "General",
    "project.config.part.runtimes": "Runtimes",
    "project.config.part.processes": "Processes",
    "project.config.part.access": "Access",
    "project.config.part.refused": "{part}, a field to fix",
    "project.config.start.title": "Start and source",
    "project.addresses.title": "Addresses",
    "project.addresses.mainLabel": "main",
    "project.addresses.open": "Open {hostname}",
    "project.addresses.publishAnother": "Publish another port",
    "project.config.installHelp":
      "Left empty, the command of {pkgmgr} is what installs the dependencies.",
    "project.config.branchHelp": "The branch the next sync brings.",
    "project.config.runtimes.title": "Runtime versions",
    "project.config.runtimes.help":
      "Applies to the project's processes and to the terminals opened in it, whatever the repository declares.",
    "project.config.runtimes.default": "Default ({version})",
    "project.config.restarts":
      "The start command or the folder changed: saving restarts {processes} if running.",
    "project.config.dropped":
      "These addresses stop answering once saved: {hostnames}.",
    "project.config.save": "Save the configuration",
    "project.config.saved":
      "{name} is rewritten in the registry, and reads as {state}.",
    "project.config.syncRefused":
      "The names on the web are not all written: {message}",
    "project.config.warning": "Saved, with one reservation: {warning}",
  },
  fr: {
    "project.tab.configuration": "Configuration",
    "project.config.sections": "Parties de la configuration",
    "project.config.part.general": "Général",
    "project.config.part.runtimes": "Environnements",
    "project.config.part.processes": "Processus",
    "project.config.part.access": "Accès",
    "project.config.part.refused": "{part}, un champ à corriger",
    "project.config.start.title": "Démarrage et source",
    "project.addresses.title": "Adresses",
    "project.addresses.mainLabel": "principal",
    "project.addresses.open": "Ouvrir {hostname}",
    "project.addresses.publishAnother": "Publier un autre port",
    "project.config.installHelp":
      "Laissée vide, c'est la commande de {pkgmgr} qui installe les dépendances.",
    "project.config.branchHelp":
      "La branche que la prochaine synchronisation ramène.",
    "project.config.runtimes.title": "Versions des runtimes",
    "project.config.runtimes.help":
      "Vaut pour les processus du projet et les terminaux ouverts dedans, quoi que le dépôt déclare.",
    "project.config.runtimes.default": "Par défaut ({version})",
    "project.config.restarts":
      "La commande de démarrage ou le dossier a changé : enregistrer redémarre {processes} si ça tourne.",
    "project.config.dropped":
      "Ces adresses cessent de répondre une fois enregistré : {hostnames}.",
    "project.config.save": "Enregistrer la configuration",
    "project.config.saved":
      "{name} est réécrit dans le registre, et se lit {state}.",
    "project.config.syncRefused":
      "Les noms sur le web ne sont pas tous écrits : {message}",
    "project.config.warning": "Enregistré, avec une réserve : {warning}",
  },
} as const;
