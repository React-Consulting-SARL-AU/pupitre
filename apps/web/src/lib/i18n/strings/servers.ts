export const servers = {
  en: {
    "servers.alerts.active": "Active alerts",
    "servers.alerts.open":
      "Open the server it names: the remedy is written there.",
    "servers.alerts.title": "Alerts",
    "servers.alerts.none": "none",
    "servers.alerts.count.one": "{count} active",
    "servers.alerts.count.other": "{count} active",
    "servers.alerts.empty":
      "Nothing to report: the agent answers, the disk breathes, the version is current.",
    "servers.unknownHost": "unknown host",
    "servers.decommissionOn": "Disappears on {date}",
    "servers.disk": "Disk",
    "servers.ram": "RAM",
    "servers.usage.value": "{label}: {percent}",
    "servers.usage.unknown": "{label}: unknown",
    "servers.load": "Load",
    "servers.metrics.title": "The last seven days",
    "servers.metrics.samples": "{count} readings",
    "servers.events.title": "Log",
    "servers.events.empty": "No event yet.",
    "servers.devices.title": "Authorised devices",
    "servers.devices.reading": "Reading the authorised devices…",
    "servers.devices.revokeFailed": "The removal failed.",
    "servers.devices.revokeFailedFix": "Try again in a moment.",
    "servers.devices.removing": "Removing…",
    "servers.devices.removed": "“{device}” no longer opens “{server}”.",
    "servers.devices.remove": "Remove",
    "servers.devices.removeHere": "Remove from here",
    "servers.devices.removeTitle": "Remove this device from this server?",
    "servers.devices.removeDescription":
      "The key of “{device}” is removed from “{server}” at the agent's next report. The device keeps its other servers.",
    "servers.devices.empty":
      "No device: add one from the app to open this server.",
    "servers.devices.otherMember":
      "This server is assigned to another member: their devices are their own.",
    "servers.devices.unassigned":
      "This server is assigned to nobody: no key is placed on it.",
    "releases.notes.title": "Release notes",
    "releases.notes.empty":
      "No version has been published yet, so there is nothing to tell here.",
    "assign.title": "Assignment",
    "assign.assigned": "Assigned",
    "assign.pending": "Pending",
    "assign.pendingLabel": "Waiting for acceptance",
    "assign.yours": "The keys of your devices are placed on this server.",
    "assign.theirs": "The keys of {who}'s devices are placed on this server.",
    "assign.themFallback": "the person it is assigned to",
    "assign.invited":
      "{email} has been invited. Their keys will land on this server as soon as they accept.",
    "assign.nobody":
      "This server is assigned to nobody: no key is placed on it and nobody can open it.",
    "assign.toMember": "Assign to a member",
    "assign.pickMember": "Pick a member…",
    "assign.assign": "Assign",
    "assign.orEmail": "Or assign to an email address",
    "assign.emailPlaceholder": "teammate@example.com",
    "assign.inviteAndAssign": "Invite and assign",
    "assign.unknownAddress":
      "An unknown address gets an invitation; the server waits for them and comes back to them on acceptance.",
    "assign.remove": "Remove",
    "assign.removeAssignment": "Remove the assignment",
    "assign.removeTitle": "Remove the assignment?",
    "assign.removeDescription":
      "The keys placed on “{server}” are removed right away, and the agent stops accepting them at its next report.",
    "assign.failed": "The assignment failed.",
    "assign.failedFix":
      "Check that the person is a member of the organisation, or assign the server to their email address.",
    "assign.removeFailed": "The assignment could not be removed.",
    "assign.removeFailedFix":
      "Try again; if it persists, check your role in the organisation.",
    "assign.assigning": "Assigning…",
    "assign.done": "Assigned to {who}.",
    "assign.invitedDone":
      "Invitation sent to {email}. The server waits for them.",
    "assign.removing": "Removing…",
    "assign.removed": "Assignment removed.",
  },
  fr: {
    "servers.alerts.active": "Alertes actives",
    "servers.alerts.open":
      "Ouvrez la fiche du serveur concerné : le remède y est écrit.",
    "servers.alerts.title": "Alertes",
    "servers.alerts.none": "aucune",
    "servers.alerts.count.one": "{count} active",
    "servers.alerts.count.other": "{count} actives",
    "servers.alerts.empty":
      "Rien à signaler : l'agent répond, le disque respire, la version est à jour.",
    "servers.unknownHost": "hôte inconnu",
    "servers.decommissionOn": "Disparaît le {date}",
    "servers.disk": "Disque",
    "servers.ram": "RAM",
    "servers.usage.value": "{label} : {percent}",
    "servers.usage.unknown": "{label} : inconnu",
    "servers.load": "Charge",
    "servers.metrics.title": "Sept derniers jours",
    "servers.metrics.samples": "{count} relevés",
    "servers.events.title": "Journal",
    "servers.events.empty": "Aucun événement pour l'instant.",
    "servers.devices.title": "Appareils autorisés",
    "servers.devices.reading": "Lecture des appareils autorisés…",
    "servers.devices.revokeFailed": "Le retrait a échoué.",
    "servers.devices.revokeFailedFix": "Réessayez dans un instant.",
    "servers.devices.removing": "Retrait…",
    "servers.devices.removed": "« {device} » n'ouvre plus « {server} ».",
    "servers.devices.remove": "Retirer",
    "servers.devices.removeHere": "Retirer d'ici",
    "servers.devices.removeTitle": "Retirer cet appareil de ce serveur ?",
    "servers.devices.removeDescription":
      "La clé de « {device} » est retirée de « {server} » au prochain état de l'agent. L'appareil garde ses autres serveurs.",
    "servers.devices.empty":
      "Aucun appareil : ajoutez-en un depuis l'app pour ouvrir ce serveur.",
    "servers.devices.otherMember":
      "Ce serveur est attribué à un autre membre : ses appareils lui appartiennent.",
    "servers.devices.unassigned":
      "Ce serveur n'est attribué à personne : aucune clé n'y est déposée.",
    "releases.notes.title": "Notes de version",
    "releases.notes.empty":
      "Aucune version n'a encore été publiée : il n'y a donc rien à raconter ici.",
    "assign.title": "Attribution",
    "assign.assigned": "Attribué",
    "assign.pending": "En attente",
    "assign.pendingLabel": "En attente d'acceptation",
    "assign.yours": "Les clés de vos appareils sont déposées sur ce serveur.",
    "assign.theirs":
      "Les clés des appareils de {who} sont déposées sur ce serveur.",
    "assign.themFallback": "la personne à qui il est attribué",
    "assign.invited":
      "{email} a reçu une invitation. Ses clés arriveront sur ce serveur dès qu'elle l'aura acceptée.",
    "assign.nobody":
      "Ce serveur n'est attribué à personne : aucune clé n'y est déposée et personne ne peut l'ouvrir.",
    "assign.toMember": "Attribuer à un membre",
    "assign.pickMember": "Choisir un membre…",
    "assign.assign": "Attribuer",
    "assign.orEmail": "Ou attribuer à une adresse email",
    "assign.emailPlaceholder": "teammate@example.com",
    "assign.inviteAndAssign": "Inviter et attribuer",
    "assign.unknownAddress":
      "Une adresse inconnue reçoit une invitation ; le serveur l'attend et lui revient à l'acceptation.",
    "assign.remove": "Retirer",
    "assign.removeAssignment": "Retirer l'attribution",
    "assign.removeTitle": "Retirer l'attribution ?",
    "assign.removeDescription":
      "Les clés déposées sur « {server} » sont retirées tout de suite, et l'agent cesse de les accepter à son prochain état.",
    "assign.failed": "L'attribution a échoué.",
    "assign.failedFix":
      "Vérifiez que la personne est membre de l'organisation, ou attribuez le serveur à son adresse email.",
    "assign.removeFailed": "L'attribution n'a pas pu être retirée.",
    "assign.removeFailedFix":
      "Réessayez ; si cela persiste, vérifiez votre rôle dans l'organisation.",
    "assign.assigning": "Attribution…",
    "assign.done": "Attribué à {who}.",
    "assign.invitedDone": "Invitation envoyée à {email}. Le serveur l'attend.",
    "assign.removing": "Retrait…",
    "assign.removed": "Attribution retirée.",
  },
}
