export const updates = {
  en: {
    "updates.agent.behindTitle": "Update the app",
    "updates.agent.behindDetail":
      "pupitred {installed} on the server, {offered} in this app",
    "updates.agent.behindBody":
      "This server has moved to a version this app does not know yet.",
    "updates.agent.aheadTitle": "Update available",
    "updates.agent.staleTitle": "This server is too far behind",
    "updates.agent.staleDetail":
      "pupitred {installed} on the server, {floor} at the very least for this app",
    "updates.agent.staleBody":
      "This agent no longer speaks the protocol of this app, so the app cannot ask it for its own update. Reinstall the agent on this server from the repair screen.",
    "updates.agent.unsignedBody":
      "This app does not carry the signature of this version, and this server no longer reaches the console that serves it: the agent would refuse the update.",
    "updates.agent.unsignedFix":
      "bun --cwd=apps/agent run release, then rebuild the app.",
    "updates.agent.upgraded": "Agent {previous} replaced by {version}.",
    "updates.agent.upgradedRestarted":
      "Agent {previous} replaced by {version}, service restarted.",
    "updates.agent.upgradeButton": "Update the agent",

    "updates.config.pendingTitle": "Configuration to migrate",
    "updates.config.pendingDetail":
      "configuration at revision {revision}, agent {agent} reads {expected}",
    "updates.config.pendingBody":
      "The agent was replaced; the files it reads have not been brought to the shape it expects. Nothing can be driven on this server until they are.",
    "updates.config.failedTitle": "Configuration migration failed",
    "updates.config.failedBody": "Migration {id} ({slug}) refused: {message}",
    "updates.config.restored":
      "The files from before the migration were put back. Nothing on the server was left half-changed.",
    "updates.config.aheadTitle": "Configuration newer than this agent",
    "updates.config.aheadBody":
      "This server was configured by a more recent agent. Update the agent again rather than let this one read a shape it does not know.",
    "updates.config.migrateButton": "Migrate the configuration",
    "updates.config.migrated": "Configuration migrated to revision {revision}.",
    "updates.config.upToDate": "Configuration already at revision {revision}.",

    "updates.modules.title": "Installed",
    "updates.modules.count.one": "{count} service",
    "updates.modules.count.other": "{count} services",
    "updates.modules.upgradeAll": "Update everything",
    "updates.modules.failed": "{name}: the update failed.",
    "updates.modules.warned": "{name}: updated, with a warning.",
    "updates.modules.report":
      "Update finished: {failed} failed, {warned} with a warning.",
  },
  fr: {
    "updates.agent.behindTitle": "Mettez l'app à jour",
    "updates.agent.behindDetail":
      "pupitred {installed} sur le serveur, {offered} dans cette app",
    "updates.agent.behindBody":
      "Ce serveur est passé à une version que cette app ne connaît pas encore.",
    "updates.agent.aheadTitle": "Mise à jour disponible",
    "updates.agent.staleTitle": "Ce serveur est trop en arrière",
    "updates.agent.staleDetail":
      "pupitred {installed} sur le serveur, {floor} au minimum pour cette app",
    "updates.agent.staleBody":
      "Cet agent ne parle plus le protocole de cette app : elle ne peut pas lui demander sa propre mise à jour. Réinstallez l'agent sur ce serveur depuis l'écran de réparation.",
    "updates.agent.unsignedBody":
      "Cette app ne porte pas la signature de cette version, et ce serveur n'atteint plus la console qui la sert : l'agent refuserait la mise à jour.",
    "updates.agent.unsignedFix":
      "bun --cwd=apps/agent run release, puis reconstruisez l'app.",
    "updates.agent.upgraded": "Agent {previous} remplacé par {version}.",
    "updates.agent.upgradedRestarted":
      "Agent {previous} remplacé par {version}, service redémarré.",
    "updates.agent.upgradeButton": "Mettre l'agent à jour",

    "updates.config.pendingTitle": "Configuration à migrer",
    "updates.config.pendingDetail":
      "configuration en révision {revision}, l'agent {agent} en lit {expected}",
    "updates.config.pendingBody":
      "L'agent a été remplacé ; les fichiers qu'il lit n'ont pas encore été portés à la forme qu'il attend. Rien ne sera piloté sur ce serveur avant que ce soit fait.",
    "updates.config.failedTitle": "La migration de configuration a échoué",
    "updates.config.failedBody": "Migration {id} ({slug}) refusée : {message}",
    "updates.config.restored":
      "Les fichiers d'avant la migration ont été remis en place. Rien n'est resté à moitié changé sur le serveur.",
    "updates.config.aheadTitle": "Configuration plus récente que cet agent",
    "updates.config.aheadBody":
      "Ce serveur a été configuré par un agent plus récent. Remettez l'agent à jour plutôt que de le laisser lire une forme qu'il ne connaît pas.",
    "updates.config.migrateButton": "Migrer la configuration",
    "updates.config.migrated": "Configuration migrée en révision {revision}.",
    "updates.config.upToDate": "Configuration déjà en révision {revision}.",

    "updates.modules.title": "Installés",
    "updates.modules.count.one": "{count} service",
    "updates.modules.count.other": "{count} services",
    "updates.modules.upgradeAll": "Tout mettre à jour",
    "updates.modules.failed": "{name} : la mise à jour a échoué.",
    "updates.modules.warned": "{name} : mis à jour, avec un avertissement.",
    "updates.modules.report":
      "Mise à jour terminée : {failed} en échec, {warned} avec avertissement.",
  },
} as const;
