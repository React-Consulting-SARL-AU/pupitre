export const status = {
  en: {
    "status.enrolling": "Enrolling",
    "status.active": "Online",
    "status.grace": "Grace period",
    "status.suspended": "Suspended",
    "status.revoked": "Revoked",
    "status.stale": "No news",

    "entitlement.none": "No organisation",
    "entitlement.valid": "Licence active",
    "entitlement.grace": "Licence in grace period",
    "entitlement.suspended": "Licence suspended",
    "entitlement.trialPending": "Free access not started",
    "entitlement.waitingTrial": "Waiting for the owner to start",
    "entitlement.launch": "Free launch · until {date}",

    "alert.server_unreachable": "Unreachable for 30 minutes",
    "alert.server_unreachable.fix":
      "Open an SSH session on the machine and check the service: systemctl status pupitred.",
    "alert.disk_high": "Disk above 90%",
    "alert.disk_high.fix":
      "Clear the logs and the images you do not need, or grow the volume at your host.",
    "alert.agent_outdated": "Agent two versions behind",
    "alert.agent_outdated.fix":
      "The agent updates itself on its next contact; start the update from the app if nothing moves.",
    "alert.entitlement_grace": "Licence in grace period",
    "alert.entitlement_grace.fix":
      "Update the payment method from the billing page.",
    "alert.backup_failed": "Last backup failed",
    "alert.backup_failed.fix":
      "Read the error under Backups, fix the bucket or its key from the Pupitre app, then back up again.",
    "alert.backup_stale": "No backup for two intervals",
    "alert.backup_stale.fix":
      "Check the agent with systemctl status pupitred, then back up from the Pupitre app.",
    "alert.unknown": "Alert",
    "alert.unknown.fix": "Open the server to find out more.",
    "alert.banner.one": "{alerts} active alert on {servers}",
    "alert.banner.other": "{alerts} active alerts on {servers}",
    "alert.banner.servers.one": "{count} server",
    "alert.banner.servers.other": "{count} servers",

    "service.noObservation": "No observation",
    "service.noObservationHeadline": "No observation to show",
    "service.noObservationDetail":
      "No active server is reporting to the platform: the figures below say nothing about the real state of things.",
    "service.staleLabel": "Stale figures",
    "service.staleHeadline": "Last observation {when}",
    "service.staleDetail":
      "More than {minutes} minutes without news from the fleet: what follows dates from then, not from now.",
    "service.observationNone": "No observation received.",
    "service.observationLast": "Last observation {when}.",
    "service.activeServers": "Active servers",
    "service.activeServersStale": "Active servers at the last observation",
    "service.responds": "Responds",
    "service.doesNotRespond": "Does not respond",
  },
  fr: {
    "status.enrolling": "Rattachement",
    "status.active": "En ligne",
    "status.grace": "Tolérance",
    "status.suspended": "Suspendu",
    "status.revoked": "Révoqué",
    "status.stale": "Sans nouvelles",

    "entitlement.none": "Aucune organisation",
    "entitlement.valid": "Droit d'usage actif",
    "entitlement.grace": "Droit d'usage en tolérance",
    "entitlement.suspended": "Droit d'usage suspendu",
    "entitlement.trialPending": "Accès gratuit non démarré",
    "entitlement.waitingTrial": "En attente du propriétaire",
    "entitlement.launch": "Lancement gratuit · jusqu'au {date}",

    "alert.server_unreachable": "Injoignable depuis 30 minutes",
    "alert.server_unreachable.fix":
      "Ouvrez une session SSH sur la machine et vérifiez le service : systemctl status pupitred.",
    "alert.disk_high": "Disque au-dessus de 90 %",
    "alert.disk_high.fix":
      "Effacez les logs et les images inutiles, ou agrandissez le volume chez votre hébergeur.",
    "alert.agent_outdated": "Agent périmé de deux versions",
    "alert.agent_outdated.fix":
      "L'agent se met à jour à son prochain contact ; relancez la mise à jour depuis l'app si rien ne bouge.",
    "alert.entitlement_grace": "Droit d'usage en tolérance",
    "alert.entitlement_grace.fix":
      "Mettez le moyen de paiement à jour depuis la facturation.",
    "alert.backup_failed": "Dernière sauvegarde en échec",
    "alert.backup_failed.fix":
      "Lisez l'erreur sous Sauvegardes, corrigez le bucket ou sa clé depuis l'app Pupitre, puis relancez une sauvegarde.",
    "alert.backup_stale": "Aucune sauvegarde depuis deux intervalles",
    "alert.backup_stale.fix":
      "Vérifiez l'agent avec systemctl status pupitred, puis sauvegardez depuis l'app Pupitre.",
    "alert.unknown": "Alerte",
    "alert.unknown.fix": "Ouvrez la fiche du serveur pour en savoir plus.",
    "alert.banner.one": "{alerts} alerte active sur {servers}",
    "alert.banner.other": "{alerts} alertes actives sur {servers}",
    "alert.banner.servers.one": "{count} serveur",
    "alert.banner.servers.other": "{count} serveurs",

    "service.noObservation": "Sans observation",
    "service.noObservationHeadline": "Aucune observation à afficher",
    "service.noObservationDetail":
      "Aucun serveur actif ne rapporte à la plateforme : les chiffres ci-dessous ne disent rien de l'état réel.",
    "service.staleLabel": "Données périmées",
    "service.staleHeadline": "Dernière observation {when}",
    "service.staleDetail":
      "Plus de {minutes} minutes sans nouvelles de la flotte : ce qui suit date de ce moment-là, pas de maintenant.",
    "service.observationNone": "Aucune observation reçue.",
    "service.observationLast": "Dernière observation {when}.",
    "service.activeServers": "Serveurs actifs",
    "service.activeServersStale": "Serveurs actifs à la dernière observation",
    "service.responds": "Répond",
    "service.doesNotRespond": "Ne répond pas",
  },
}
