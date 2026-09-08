export const updates = {
  en: {
    "updates.agent.behindTitle": "Update the app",
    "updates.agent.behindDetail":
      "pupitred {installed} on the server, {offered} in this app",
    "updates.agent.behindBody":
      "This server has moved to a version this app does not know yet. Everything it knows how to ask keeps working.",
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

    "updates.modules.title": "Updating services",
    "updates.modules.intro":
      "The agent replays the install steps of the {count} modules it placed on this machine.",
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
      "Ce serveur est passé à une version que cette app ne connaît pas encore. Tout ce qu'elle sait demander continue de fonctionner.",
    "updates.agent.aheadTitle": "Mise à jour disponible",
    "updates.agent.staleTitle": "Ce serveur est trop en arrière",
    "updates.agent.staleDetail":
      "pupitred {installed} sur le serveur, {floor} au minimum pour cette app",
    "updates.agent.staleBody":
      "Cet agent ne parle plus le protocole de cette app : elle ne peut pas lui demander sa propre mise à jour. Réinstalle l'agent sur ce serveur depuis l'écran de réparation.",
    "updates.agent.unsignedBody":
      "Cette app ne porte pas la signature de cette version, et ce serveur n'atteint plus la console qui la sert : l'agent refuserait la mise à jour.",
    "updates.agent.unsignedFix":
      "bun --cwd=apps/agent run release, puis reconstruis l'app.",
    "updates.agent.upgraded": "Agent {previous} remplacé par {version}.",
    "updates.agent.upgradedRestarted":
      "Agent {previous} remplacé par {version}, service redémarré.",
    "updates.agent.upgradeButton": "Mettre l'agent à jour",

    "updates.modules.title": "Mise à jour des services",
    "updates.modules.intro":
      "L'agent rejoue les étapes d'installation des {count} modules qu'il a posés sur cette machine.",
    "updates.modules.upgradeAll": "Tout mettre à jour",
    "updates.modules.failed": "{name} : la mise à jour a échoué.",
    "updates.modules.warned": "{name} : mis à jour, avec un avertissement.",
    "updates.modules.report":
      "Mise à jour terminée : {failed} en échec, {warned} avec avertissement.",
  },
} as const;
