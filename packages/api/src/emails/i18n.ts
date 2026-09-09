import type { Locale } from "@pupitre/shared/i18n"

export const EMAIL_FR = {
  "common.brand": "Pupitre",
  "common.tagline":
    "Vos agents IA travaillent sur une machine à eux. Votre laptop respire.",
  "common.trouble":
    "Si le bouton ne s'ouvre pas, copiez cette adresse dans votre navigateur :",
  "common.automatic": "Message automatique, personne ne lit les réponses.",

  "label.address": "Adresse",
  "label.organization": "Organisation",
  "label.inviter": "Invitée par",
  "label.server": "Serveur",
  "label.agent_version": "Version de l'agent",
  "label.architecture": "Architecture",
  "label.fingerprint": "Empreinte",
  "label.device": "Appareil",
  "label.added_at": "Ajouté le",
  "label.deadline": "Date limite",
  "label.servers": "Serveurs concernés",
  "label.erased_on": "Effacement",
  "label.disk": "Disque",
  "label.last_seen": "Dernier signe de vie",
  "label.latest_version": "Dernière version publiée",
  "label.new_email": "Nouvelle adresse",

  "email_change.subject": "Confirmez le changement d'adresse",
  "email_change.preview":
    "Une nouvelle adresse a été demandée pour votre compte Pupitre.",
  "email_change.title": "Changement d'adresse",
  "email_change.body":
    "Une nouvelle adresse a été demandée pour votre compte. Ce message part à l'adresse actuelle : tant que personne n'ouvre ce lien, rien ne change et vous continuez à vous connecter comme avant.",
  "email_change.cta": "Confirmer la nouvelle adresse",
  "email_change.footnote":
    "Vous n'avez rien demandé ? Ignorez ce message, et changez de second facteur ou révoquez vos clés d'accès si vous doutez de votre session.",

  "magic_link.subject": "Votre lien de connexion Pupitre",
  "magic_link.preview":
    "Ce lien ouvre votre session. Il expire dans 15 minutes.",
  "magic_link.title": "Connexion à Pupitre",
  "magic_link.body":
    "Ouvrez ce lien pour entrer dans votre console. Il expire dans 15 minutes et ne sert qu'une fois.",
  "magic_link.cta": "Se connecter",
  "magic_link.footnote":
    "Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'entre.",

  "invitation.subject": "{organization} vous invite sur Pupitre",
  "invitation.preview": "{inviter} vous invite à rejoindre {organization}.",
  "invitation.title": "Invitation à {organization}",
  "invitation.body":
    "{inviter} vous invite à rejoindre l'organisation {organization} sur Pupitre. En acceptant, vous voyez les serveurs qui vous sont attribués et vos clés y sont déposées.",
  "invitation.cta": "Accepter l'invitation",
  "invitation.footnote": "L'invitation expire dans 7 jours.",

  "server_enrolled.subject": "{server} est prêt",
  "server_enrolled.preview":
    "L'agent répond. Le serveur est prêt à travailler.",
  "server_enrolled.title": "{server} est enrôlé",
  "server_enrolled.body":
    "L'agent est installé et répond. Ouvrez l'app Pupitre : la machine est prête, les clés de vos appareils y sont déposées.",
  "server_enrolled.cta": "Ouvrir la console",
  "server_enrolled.footnote":
    "Vérifiez l'empreinte de l'hôte à la première connexion : elle doit être celle ci-dessus.",

  "server_assigned.subject": "Le serveur {server} vous est attribué",
  "server_assigned.preview": "{organization} vous attribue {server}.",
  "server_assigned.title": "{server} vous est attribué",
  "server_assigned.body":
    "{organization} vous attribue ce serveur. Les clés de vos appareils y sont déjà déposées : ouvrez l'app Pupitre et il apparaît dans votre liste.",
  "server_assigned.cta": "Ouvrir la console",
  "server_assigned.footnote":
    "Vous ne reconnaissez pas cette organisation ? Écrivez à la personne qui vous a invité avant de vous connecter.",

  "device_added.subject": "Un appareil a été ajouté à votre compte",
  "device_added.preview": "{device} peut désormais ouvrir vos serveurs.",
  "device_added.title": "Nouvel appareil : {device}",
  "device_added.body":
    "La clé publique de cet appareil est déposée sur les serveurs qui vous sont attribués. Il peut désormais les ouvrir.",
  "device_added.cta": "Voir mes appareils",
  "device_added.footnote":
    "Ce n'est pas vous ? Retirez cet appareil depuis la console : sa clé quitte vos serveurs à leur prochain contact.",

  "entitlement_grace.subject": "Votre droit d'usage Pupitre est en tolérance",
  "entitlement_grace.preview":
    "Le paiement n'a pas abouti. Vos serveurs tournent jusqu'au {deadline}.",
  "entitlement_grace.title": "Paiement en attente",
  "entitlement_grace.body":
    "Le dernier paiement de {organization} n'a pas abouti. Vos serveurs continuent de travailler jusqu'au {deadline}. Passé cette date, l'agent se met en veille.",
  "entitlement_grace.cta": "Corriger le paiement",
  "entitlement_grace.footnote":
    "Le remède : ouvrez la facturation, mettez à jour le moyen de paiement. Vos serveurs repartent au contact suivant.",

  "server_suspended.subject": "Vos serveurs Pupitre sont suspendus",
  "server_suspended.preview":
    "La tolérance est écoulée. L'agent ne travaille plus.",
  "server_suspended.title": "Serveurs suspendus",
  "server_suspended.body":
    "La tolérance de {organization} est écoulée. L'agent refuse désormais de travailler sur {count} serveur(s). Vos données, vos projets et vos services restent en place sur les machines : rien n'est effacé.",
  "server_suspended.cta": "Reprendre l'abonnement",
  "server_suspended.footnote":
    "Le remède : reprenez l'abonnement depuis la facturation. Les serveurs redeviennent actifs à leur prochain contact.",

  "alert_server_unreachable.subject": "{server} ne répond plus",
  "alert_server_unreachable.preview":
    "Aucun signe de vie depuis plus de 30 minutes.",
  "alert_server_unreachable.title": "{server} ne répond plus",
  "alert_server_unreachable.body":
    "L'agent de ce serveur n'a rien envoyé depuis plus de 30 minutes. La machine est peut-être éteinte, redémarrée, ou coupée du réseau. Vos données ne sont pas touchées : la plateforme attend simplement son prochain contact.",
  "alert_server_unreachable.cta": "Ouvrir la console",
  "alert_server_unreachable.footnote":
    "Le remède : ouvrez une session SSH sur la machine et vérifiez le service avec systemctl status pupitred. Nous vous écrirons de nouveau si le silence revient après un retour à la normale.",

  "alert_disk_high.subject": "{server} : disque à {disk} %",
  "alert_disk_high.preview": "Le disque dépasse 90 % de remplissage.",
  "alert_disk_high.title": "Le disque de {server} se remplit",
  "alert_disk_high.body":
    "Le disque de ce serveur est occupé à {disk} %. Au-delà de 95 %, les services s'arrêtent d'écrire et les sessions de vos agents échouent.",
  "alert_disk_high.cta": "Ouvrir la console",
  "alert_disk_high.footnote":
    "Le remède : effacez les journaux et les images inutiles, par exemple avec docker system prune -a, ou agrandissez le volume chez votre hébergeur.",

  "alert_agent_outdated.subject":
    "L'agent de {server} a deux versions de retard",
  "alert_agent_outdated.preview":
    "La version {version} est publiée ; ce serveur est resté en arrière.",
  "alert_agent_outdated.title": "L'agent de {server} est périmé",
  "alert_agent_outdated.body":
    "Ce serveur exécute l'agent {current} alors que {version} est publiée. Deux versions de retard : les correctifs et les nouveaux modules lui manquent.",
  "alert_agent_outdated.cta": "Ouvrir la console",
  "alert_agent_outdated.footnote":
    "Le remède : l'agent se met à jour tout seul à son prochain contact. S'il ne le fait pas, relancez la mise à jour depuis l'app Pupitre.",

  "alert_entitlement_grace.subject": "{server} tourne en tolérance",
  "alert_entitlement_grace.preview":
    "Le droit d'usage de ce serveur expire le {deadline}.",
  "alert_entitlement_grace.title": "{server} est en tolérance",
  "alert_entitlement_grace.body":
    "Le paiement de {organization} est en attente. Ce serveur continue de tourner jusqu'au {deadline} ; après cette date, l'agent se met en pause et vos sessions s'arrêtent. La machine et ses données restent intactes.",
  "alert_entitlement_grace.cta": "Corriger le paiement",
  "alert_entitlement_grace.footnote":
    "Le remède : mettez le moyen de paiement à jour depuis la facturation. Le serveur redevient actif à son prochain contact.",

  "server_decommission.subject": "{server} sera effacé le {deadline}",
  "server_decommission.preview":
    "Ce serveur quitte Pupitre dans 7 jours. La machine n'est pas touchée.",
  "server_decommission.title": "Décommission de {server}",
  "server_decommission.body":
    "Ce serveur a été retiré de {organization}. Nous effaçons ce que la plateforme en sait le {deadline}, dans 7 jours. La machine, ses données et ses services ne sont pas touchés : seul le lien avec Pupitre disparaît.",
  "server_decommission.cta": "Ouvrir la console",
  "server_decommission.footnote":
    "Si ce retrait était voulu, il n'y a rien à faire.",
} as const

export type EmailMessageKey = keyof typeof EMAIL_FR

export const EMAIL_EN: Record<EmailMessageKey, string> = {
  "common.brand": "Pupitre",
  "common.tagline":
    "Your AI agents work on a machine of their own. Your laptop breathes.",
  "common.trouble":
    "If the button does not open, copy this address into your browser:",
  "common.automatic": "Automated message — nobody reads replies.",

  "label.address": "Address",
  "label.organization": "Organisation",
  "label.inviter": "Invited by",
  "label.server": "Server",
  "label.agent_version": "Agent version",
  "label.architecture": "Architecture",
  "label.fingerprint": "Fingerprint",
  "label.device": "Device",
  "label.added_at": "Added on",
  "label.deadline": "Deadline",
  "label.servers": "Servers affected",
  "label.erased_on": "Erased on",
  "label.disk": "Disk",
  "label.last_seen": "Last sign of life",
  "label.latest_version": "Latest published version",
  "label.new_email": "New address",

  "email_change.subject": "Confirm the address change",
  "email_change.preview":
    "A new address has been asked for on your Pupitre account.",
  "email_change.title": "Address change",
  "email_change.body":
    "A new address has been asked for on your account. This message goes to the current one: until someone opens this link nothing moves, and you keep signing in as before.",
  "email_change.cta": "Confirm the new address",
  "email_change.footnote":
    "Did not ask for this? Ignore the message, and rotate your second factor or revoke your passkeys if you have any doubt about your session.",

  "magic_link.subject": "Your Pupitre sign-in link",
  "magic_link.preview":
    "This link opens your session. It expires in 15 minutes.",
  "magic_link.title": "Sign in to Pupitre",
  "magic_link.body":
    "Open this link to enter your console. It expires in 15 minutes and works once.",
  "magic_link.cta": "Sign in",
  "magic_link.footnote":
    "Did not ask for this? Ignore the message: without the link, nobody gets in.",

  "invitation.subject": "{organization} invites you to Pupitre",
  "invitation.preview": "{inviter} invites you to join {organization}.",
  "invitation.title": "Invitation to {organization}",
  "invitation.body":
    "{inviter} invites you to join the {organization} organisation on Pupitre. Once you accept, you see the servers assigned to you and your keys land on them.",
  "invitation.cta": "Accept the invitation",
  "invitation.footnote": "The invitation expires in 7 days.",

  "server_enrolled.subject": "{server} is ready",
  "server_enrolled.preview": "The agent answers. The server is ready to work.",
  "server_enrolled.title": "{server} is enrolled",
  "server_enrolled.body":
    "The agent is installed and answering. Open the Pupitre app: the machine is ready and your device keys are on it.",
  "server_enrolled.cta": "Open the console",
  "server_enrolled.footnote":
    "Check the host fingerprint on your first connection: it must be the one above.",

  "server_assigned.subject": "The server {server} is yours",
  "server_assigned.preview": "{organization} assigned {server} to you.",
  "server_assigned.title": "{server} is yours",
  "server_assigned.body":
    "{organization} assigned this server to you. Your device keys are already on it: open the Pupitre app and it shows up in your list.",
  "server_assigned.cta": "Open the console",
  "server_assigned.footnote":
    "Do not recognise this organisation? Write to whoever invited you before connecting.",

  "device_added.subject": "A device was added to your account",
  "device_added.preview": "{device} can now open your servers.",
  "device_added.title": "New device: {device}",
  "device_added.body":
    "This device's public key is on the servers assigned to you. It can open them from now on.",
  "device_added.cta": "See my devices",
  "device_added.footnote":
    "Not you? Remove the device from the console: its key leaves your servers on their next contact.",

  "entitlement_grace.subject": "Your Pupitre entitlement is in grace",
  "entitlement_grace.preview":
    "The payment did not go through. Your servers run until {deadline}.",
  "entitlement_grace.title": "Payment pending",
  "entitlement_grace.body":
    "The last payment for {organization} did not go through. Your servers keep working until {deadline}. After that date, the agent goes to sleep.",
  "entitlement_grace.cta": "Fix the payment",
  "entitlement_grace.footnote":
    "The fix: open billing and update the payment method. Your servers resume on their next contact.",

  "server_suspended.subject": "Your Pupitre servers are suspended",
  "server_suspended.preview":
    "The grace period ran out. The agent stopped working.",
  "server_suspended.title": "Servers suspended",
  "server_suspended.body":
    "The grace period for {organization} ran out. The agent now refuses to work on {count} server(s). Your data, projects and services stay in place on the machines: nothing is erased.",
  "server_suspended.cta": "Resume the subscription",
  "server_suspended.footnote":
    "The fix: resume the subscription from billing. The servers turn active again on their next contact.",

  "alert_server_unreachable.subject": "{server} stopped answering",
  "alert_server_unreachable.preview":
    "No sign of life for more than 30 minutes.",
  "alert_server_unreachable.title": "{server} stopped answering",
  "alert_server_unreachable.body":
    "This server's agent has sent nothing for more than 30 minutes. The machine may be off, rebooting, or cut from the network. Your data is untouched: the platform is simply waiting for its next contact.",
  "alert_server_unreachable.cta": "Open the console",
  "alert_server_unreachable.footnote":
    "The fix: open an SSH session on the machine and check the service with systemctl status pupitred. We will write again if the silence returns after a return to normal.",

  "alert_disk_high.subject": "{server}: disk at {disk}%",
  "alert_disk_high.preview": "The disk is more than 90% full.",
  "alert_disk_high.title": "The disk of {server} is filling up",
  "alert_disk_high.body":
    "This server's disk is {disk}% full. Past 95%, services stop writing and your agents' sessions fail.",
  "alert_disk_high.cta": "Open the console",
  "alert_disk_high.footnote":
    "The fix: clear logs and unused images, for instance with docker system prune -a, or grow the volume at your host.",

  "alert_agent_outdated.subject":
    "The agent on {server} is two versions behind",
  "alert_agent_outdated.preview":
    "Version {version} is published; this server stayed behind.",
  "alert_agent_outdated.title": "The agent on {server} is outdated",
  "alert_agent_outdated.body":
    "This server runs agent {current} while {version} is published. Two versions behind: it is missing the fixes and the new modules.",
  "alert_agent_outdated.cta": "Open the console",
  "alert_agent_outdated.footnote":
    "The fix: the agent updates itself on its next contact. If it does not, start the update from the Pupitre app.",

  "alert_entitlement_grace.subject": "{server} is running in grace",
  "alert_entitlement_grace.preview":
    "The entitlement of this server expires on {deadline}.",
  "alert_entitlement_grace.title": "{server} is in grace",
  "alert_entitlement_grace.body":
    "The payment for {organization} is pending. This server keeps running until {deadline}; after that date the agent pauses and your sessions stop. The machine and its data stay intact.",
  "alert_entitlement_grace.cta": "Fix the payment",
  "alert_entitlement_grace.footnote":
    "The fix: update the payment method from billing. The server turns active again on its next contact.",

  "server_decommission.subject": "{server} will be erased on {deadline}",
  "server_decommission.preview":
    "This server leaves Pupitre in 7 days. The machine is untouched.",
  "server_decommission.title": "Decommissioning {server}",
  "server_decommission.body":
    "This server was removed from {organization}. We erase what the platform knows about it on {deadline}, seven days from now. The machine, its data and its services are untouched: only the link with Pupitre disappears.",
  "server_decommission.cta": "Open the console",
  "server_decommission.footnote":
    "If the removal was intended, there is nothing to do.",
}

const EMAIL_MESSAGES: Record<Locale, Record<EmailMessageKey, string>> = {
  fr: EMAIL_FR,
  en: EMAIL_EN,
}

const PLACEHOLDER_RE = /\{(\w+)\}/g

export type EmailParams = Record<string, string | number>

export function translateEmail(
  locale: Locale,
  key: EmailMessageKey,
  params: EmailParams = {}
): string {
  return EMAIL_MESSAGES[locale][key].replace(
    PLACEHOLDER_RE,
    (match, name: string) => (name in params ? String(params[name]) : match)
  )
}

export function emailTranslator(locale: Locale) {
  return (key: EmailMessageKey, params: EmailParams = {}) =>
    translateEmail(locale, key, params)
}

export type EmailTranslator = ReturnType<typeof emailTranslator>
