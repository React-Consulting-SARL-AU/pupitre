import type { Locale } from "@pupitre/shared/i18n"

const FR = {
  unauthenticated: "Authentification requise.",
  unauthenticated_fix:
    "Connectez-vous, ou envoyez un jeton valide dans l'en-tête Authorization.",
  forbidden: "Action non autorisée.",
  no_active_organization: "Aucune organisation active.",
  no_active_organization_fix:
    "Sélectionnez une organisation avant de continuer.",
  not_a_member: "Vous n'êtes plus membre de cette organisation.",
  role_required: "Le rôle {role} est requis.",
  platform_admin_required: "Réservé à l'équipe Pupitre.",
  platform_role_required:
    "Le rôle {role} dans l'organisation Pupitre est requis pour agir ici.",
  publish_token_invalid: "Jeton de publication invalide.",
  publish_token_invalid_fix:
    "Vérifiez PUPITRE_PUBLISH_TOKEN des deux côtés : le Worker et GitHub Actions.",
  server_token_required: "Jeton de serveur requis.",
  server_token_unknown: "Jeton de serveur inconnu.",
  server_token_revoked: "Ce serveur a été révoqué.",
  server_token_revoked_fix: "Réinstallez l'agent depuis l'app.",
  not_found: "Cette ressource n'existe pas.",
  device_not_found: "Cet appareil n'existe pas.",
  key_not_ed25519: "Seules les clés ed25519 sont acceptées.",
  key_not_ed25519_fix: "générez une clé ed25519 : ssh-keygen -t ed25519",
  key_malformed: "Cette clé publique est illisible.",
  key_malformed_fix:
    "Collez la ligne entière de votre fichier .pub, par exemple : ssh-ed25519 AAAAC3Nza… vous@machine.",
  device_exists: "Cet appareil est déjà enregistré.",
  device_exists_fix:
    "Utilisez l'appareil déjà enregistré, ou ajoutez-en un avec une autre clé.",
  server_not_found: "Ce serveur n'existe pas.",
  server_revoked_no_suspend:
    "Ce serveur est révoqué : il n'y a rien à suspendre.",
  server_revoked_no_suspend_fix:
    "Sa ligne s'efface à la décommission ; un serveur révoqué ne distribue déjà plus aucune clé.",
  server_not_admin_suspended:
    "Ce serveur n'a pas été suspendu par l'équipe Pupitre.",
  server_not_admin_suspended_fix:
    "Une suspension de facturation se lève en rétablissant l'abonnement de l'organisation.",
  user_not_found: "Ce compte n'existe pas.",
  platform_member_protected: "Ce compte est membre de l'organisation Pupitre.",
  platform_member_protected_fix:
    "Retirez-le d'abord de l'organisation Pupitre depuis sa page des membres.",
  account_deactivated: "Ce compte est fermé.",
  account_deactivated_fix:
    "Écrivez à support@pupitre.studio pour le faire rouvrir.",
  user_already_deactivated: "Ce compte est déjà désactivé.",
  user_already_deactivated_fix:
    "Réactivez-le d'abord : POST /admin/users/:id/reactivate.",
  user_active: "Ce compte n'a ni désactivation ni suppression à lever.",
  user_active_fix:
    "Une suspension se lève par POST /admin/users/:id/unban ; ce compte n'a rien d'autre.",
  sole_owner:
    "Ce compte est le seul propriétaire d'une organisation qui porte encore un serveur ou un abonnement.",
  sole_owner_fix:
    "Transférez l'organisation à un autre membre, ou fermez-la : POST /admin/organizations/:id/transfer, DELETE /admin/organizations/:id.",
  email_verified: "L'adresse de ce compte est déjà vérifiée.",
  email_verified_fix:
    "Il n'y a rien à renvoyer ; le compte se connecte par lien magique ou clé d'accès.",
  organization_closed: "Cette organisation est fermée.",
  organization_closed_fix:
    "Choisissez une autre organisation, ou écrivez à support@pupitre.studio pour la faire rouvrir.",
  organization_already_suspended: "Cette organisation est déjà suspendue.",
  organization_already_suspended_fix:
    "Levez d'abord la suspension : POST /admin/organizations/:id/restore.",
  slug_taken: "Le slug « {slug} » est déjà pris.",
  slug_taken_fix: "Choisissez un autre slug.",
  last_owner:
    "Cette organisation n'aurait plus aucun propriétaire après ce retrait.",
  last_owner_fix:
    "Nommez d'abord un autre propriétaire : POST /admin/organizations/:id/transfer.",
  member_not_found: "Cette personne n'est pas membre de cette organisation.",
  organization_forbidden: "Cette organisation n'est pas la vôtre.",
  organization_forbidden_fix:
    "Choisissez une organisation dont vous êtes membre.",
  assignee_not_a_member:
    "Cette personne n'est pas membre de cette organisation.",
  assignee_not_a_member_fix:
    "Invitez-la d'abord, ou attribuez le serveur à son adresse email.",
  already_a_member: "Cette personne est déjà membre de l'organisation.",
  already_a_member_fix:
    "Attribuez-lui le serveur directement, sans passer par une invitation.",
  release_not_found: "Cette version de l'agent n'existe pas.",
  release_not_found_fix:
    "Demandez la dernière version publiée : GET /releases/agent/latest.",
  release_conflict:
    "La version {version} ({arch}) est déjà publiée avec une autre empreinte.",
  release_conflict_fix:
    "Publiez un nouveau numéro de version : une version déjà publiée n'est jamais réécrite.",
  app_release_not_found: "Aucune version de l'app n'est publiée ici.",
  app_release_not_found_fix:
    "Attendez la première release signée, ou demandez un autre canal : GET /releases/app/latest?channel=beta.",
  app_release_conflict:
    "La version {version} ({os}) de l'app est déjà publiée avec une autre empreinte.",
  app_release_conflict_fix:
    "Publiez un nouveau numéro de version : une version déjà publiée n'est jamais réécrite.",
  release_url_signed:
    "Redirection vers le binaire signé sur R2, valable {seconds} secondes.",
  release_url_local:
    "Le stockage R2 n'est pas configuré : cette URL est locale et ne télécharge rien.",
  seat_quota_reached:
    "Votre abonnement couvre {quota} serveurs, ils sont tous utilisés.",
  seat_quota_reached_fix:
    "Ajoutez des sièges depuis la facturation de la console (POST /orgs/{organization}/seats), ou supprimez un serveur.",
  subscription_missing: "Cette organisation n'a aucun abonnement à ajuster.",
  subscription_missing_fix:
    "Démarrez l'essai ou commandez des sièges depuis /dashboard/billing.",
  seats_below_usage: "Cette organisation occupe déjà {used} sièges.",
  seats_below_usage_fix:
    "Supprimez d'abord des serveurs, puis réduisez le nombre de sièges.",
  seats_locked:
    "Le nombre de sièges ne change pas pendant l'essai, pendant le lancement, ni sur un abonnement accordé par Pupitre.",
  seats_locked_fix:
    "Attendez la fin de l'essai : un abonnement payé se redimensionne depuis /dashboard/billing.",
  billing_launch:
    "Pendant le lancement, l'abonnement est accordé par Pupitre : il n'y a pas de portail de paiement.",
  billing_launch_fix:
    "Rien à payer avant la fin du lancement. Le portail s'ouvrira avec le premier abonnement facturé.",
  billing_granted:
    "Cet abonnement est accordé par Pupitre : il n'y a pas de portail de paiement.",
  billing_granted_fix:
    "Rien à payer tant qu'il court. Le portail s'ouvrira avec le premier abonnement facturé.",
  subscription_not_found: "Cet abonnement n'existe pas.",
  subscription_live: "Cette organisation a encore un abonnement en cours.",
  subscription_live_fix:
    "Arrêtez-le d'abord : POST /admin/subscriptions/:id/cancel.",
  platform_organization:
    "L'organisation Pupitre n'a besoin d'aucun abonnement.",
  platform_organization_fix:
    "Son droit d'usage tient à ce qu'elle est ; il n'y a rien à accorder.",
  subscription_not_granted:
    "Cet abonnement n'a pas été accordé par l'équipe Pupitre.",
  subscription_not_granted_fix:
    "Un abonnement Stripe se redimensionne par son propriétaire, depuis la facturation de la console.",
  subscription_already_canceled: "Cet abonnement est déjà arrêté.",
  subscription_already_canceled_fix:
    "Effacez-le s'il n'a plus à figurer : DELETE /admin/subscriptions/:id.",
  affiliate_code_taken: "Le code « {code} » est déjà pris.",
  affiliate_code_taken_fix:
    "Choisissez un autre code, ou laissez la plateforme en tirer un.",
  affiliate_link_not_found: "Ce lien d'affiliation n'existe pas.",
  mail_thread_not_found: "Ce fil de discussion n'existe pas.",
  mail_html_not_found: "Ce message n'a pas de version HTML.",
  mail_attachment_not_found: "Cette pièce jointe n'existe pas.",
  mail_assignee_not_on_the_team:
    "Cette personne n'est pas membre de l'organisation Pupitre.",
  mail_assignee_not_on_the_team_fix:
    "Attribuez le fil à un membre de l'équipe, ou laissez-le sans attributaire.",
  mail_thread_has_no_recipient:
    "Ce fil ne porte aucune adresse à qui répondre.",
  mail_thread_has_no_recipient_fix:
    "Écrivez un nouveau message depuis la boîte, en nommant le destinataire.",
  mail_send_failed: "L'envoi a échoué : {reason}",
  mail_send_failed_fix:
    "Le message est enregistré comme échoué dans le fil ; réessayez, l'envoi ne part qu'une fois.",
  mail_attachment_blocked:
    "Le fichier « {filename} » est d'un type refusé en pièce jointe.",
  mail_attachment_blocked_fix:
    "Compressez-le en archive .zip avant de l'ajouter.",
  mail_attachments_too_large:
    "Les pièces jointes dépassent {limit} Mio en tout.",
  mail_attachments_too_large_fix:
    "Retirez une pièce jointe, ou envoyez-la dans un second message.",
  mail_upload_missing:
    "Le fichier « {filename} » n'a pas été reçu par le seau.",
  mail_upload_missing_fix: "Téléversez-le à nouveau, puis renvoyez le message.",
  mail_upload_foreign:
    "Le fichier « {filename} » n'a pas été téléversé depuis votre session.",
  mail_upload_foreign_fix:
    "Ajoutez la pièce jointe depuis ce formulaire, puis renvoyez le message.",
  mail_upload_size_mismatch:
    "Le fichier « {filename} » est plus gros que ce qui a été annoncé.",
  mail_upload_size_mismatch_fix: "Retirez-le et ajoutez-le à nouveau.",
  entitlement_required: "Cette organisation n'a aucun abonnement en cours.",
  entitlement_required_fix:
    "Démarrez votre essai de trente jours, sans carte, depuis /dashboard/billing.",
  server_suspended: "L'abonnement de cette organisation est suspendu.",
  server_suspended_fix:
    "Reprenez un abonnement depuis /dashboard/billing pour retrouver vos serveurs.",
  organization_not_found: "Cette organisation n'existe pas.",
  billing_customer_missing:
    "Cette organisation n'a pas encore de client Stripe.",
  billing_customer_missing_fix:
    "Passez d'abord par le checkout : POST /orgs/{organization}/checkout.",
  stripe_signature_invalid: "Signature Stripe invalide.",
  stripe_signature_invalid_fix:
    "Signez le corps brut avec le secret du webhook, dans les cinq minutes.",
  enrollment_unknown: "Ce jeton d'enrôlement n'existe pas.",
  enrollment_used: "Ce jeton d'enrôlement a déjà été échangé.",
  enrollment_expired: "Ce jeton d'enrôlement a expiré.",
  enrollment_restart_fix:
    "Relancez l'installation depuis l'app pour obtenir un nouveau jeton.",
  internal: "Erreur interne (référence {ref}).",
  rate_limited: "Trop de requêtes.",
  rate_limited_fix: "Réessayez dans {seconds} secondes.",
  unreadable_body: "Le corps de la requête est illisible.",
  unreadable_body_fix: "Envoyez du JSON valide.",
  validation_field: "Le champ « {path} » ({location}) est invalide.",
  location_body: "corps",
  location_query: "paramètres de requête",
  location_params: "URL",
  location_headers: "en-têtes",
  location_cookie: "cookies",
  location_response: "réponse",
  reason_required: "Ce champ est requis.",
  reason_expected_string: "Attendu : une chaîne de caractères.",
  reason_expected_number: "Attendu : un nombre.",
  reason_expected_integer: "Attendu : un entier.",
  reason_expected_boolean: "Attendu : un booléen.",
  reason_expected_object: "Attendu : un objet.",
  reason_expected_array: "Attendu : une liste.",
  reason_min_length: "Attendu : au moins {limit} caractères.",
  reason_max_length: "Attendu : au plus {limit} caractères.",
  reason_minimum: "Attendu : une valeur d'au moins {limit}.",
  reason_maximum: "Attendu : une valeur d'au plus {limit}.",
  reason_min_items: "Attendu : au moins {limit} éléments.",
  reason_max_items: "Attendu : au plus {limit} éléments.",
  reason_pattern: "Le format attendu n'est pas respecté.",
  reason_one_of: "Attendu : une des valeurs autorisées.",
  reason_invalid: "La valeur n'est pas acceptée.",
} as const

export type MessageKey = keyof typeof FR

const EN: Record<MessageKey, string> = {
  unauthenticated: "Authentication required.",
  unauthenticated_fix:
    "Sign in, or send a valid token in the Authorization header.",
  forbidden: "Not allowed.",
  no_active_organization: "No active organization.",
  no_active_organization_fix: "Select an organization before continuing.",
  not_a_member: "You are no longer a member of this organization.",
  role_required: "The {role} role is required.",
  platform_admin_required: "Reserved to the Pupitre team.",
  platform_role_required:
    "The {role} role in the Pupitre organization is required to act here.",
  publish_token_invalid: "Invalid publish token.",
  publish_token_invalid_fix:
    "Check PUPITRE_PUBLISH_TOKEN on both sides: the Worker and GitHub Actions.",
  server_token_required: "Server token required.",
  server_token_unknown: "Unknown server token.",
  server_token_revoked: "This server has been revoked.",
  server_token_revoked_fix: "Reinstall the agent from the app.",
  not_found: "This resource does not exist.",
  device_not_found: "This device does not exist.",
  key_not_ed25519: "Only ed25519 keys are accepted.",
  key_not_ed25519_fix: "generate an ed25519 key: ssh-keygen -t ed25519",
  key_malformed: "This public key is unreadable.",
  key_malformed_fix:
    "Paste the whole line of your .pub file, for example: ssh-ed25519 AAAAC3Nza… you@machine.",
  device_exists: "This device is already registered.",
  device_exists_fix:
    "Use the device already registered, or add one with another key.",
  server_not_found: "This server does not exist.",
  server_revoked_no_suspend:
    "This server is revoked: there is nothing left to suspend.",
  server_revoked_no_suspend_fix:
    "Its row disappears at decommission; a revoked server already hands out no key.",
  server_not_admin_suspended: "The Pupitre team did not suspend this server.",
  server_not_admin_suspended_fix:
    "A billing suspension lifts by restoring the organization's subscription.",
  user_not_found: "This account does not exist.",
  platform_member_protected:
    "This account belongs to the Pupitre organization.",
  platform_member_protected_fix:
    "Remove them from the Pupitre organization first, on its members page.",
  account_deactivated: "This account is closed.",
  account_deactivated_fix:
    "Write to support@pupitre.studio to have it reopened.",
  user_already_deactivated: "This account is already deactivated.",
  user_already_deactivated_fix:
    "Reactivate it first: POST /admin/users/:id/reactivate.",
  user_active: "This account has no deactivation and no deletion to lift.",
  user_active_fix:
    "A suspension lifts with POST /admin/users/:id/unban; this account has nothing else.",
  sole_owner:
    "This account is the sole owner of an organization that still holds a server or a subscription.",
  sole_owner_fix:
    "Transfer the organization to another member, or close it: POST /admin/organizations/:id/transfer, DELETE /admin/organizations/:id.",
  email_verified: "This account's address is already verified.",
  email_verified_fix:
    "There is nothing to send again; the account signs in with a magic link or a passkey.",
  organization_closed: "This organization is closed.",
  organization_closed_fix:
    "Pick another organization, or write to support@pupitre.studio to have it reopened.",
  organization_already_suspended: "This organization is already suspended.",
  organization_already_suspended_fix:
    "Lift the suspension first: POST /admin/organizations/:id/restore.",
  slug_taken: 'The slug "{slug}" is already taken.',
  slug_taken_fix: "Pick another slug.",
  last_owner: "This organization would be left without an owner.",
  last_owner_fix:
    "Name another owner first: POST /admin/organizations/:id/transfer.",
  member_not_found: "This person is not a member of this organization.",
  organization_forbidden: "This organization is not yours.",
  organization_forbidden_fix: "Pick an organization you belong to.",
  assignee_not_a_member: "This person is not a member of this organization.",
  assignee_not_a_member_fix:
    "Invite them first, or assign the server to their email address.",
  already_a_member: "This person is already a member of the organization.",
  already_a_member_fix:
    "Assign the server to them directly, without an invitation.",
  release_not_found: "This agent version does not exist.",
  release_not_found_fix:
    "Ask for the latest published version: GET /releases/agent/latest.",
  release_conflict:
    "Version {version} ({arch}) is already published with another fingerprint.",
  release_conflict_fix:
    "Publish a new version number: a published version is never rewritten.",
  app_release_not_found: "No version of the app is published here.",
  app_release_not_found_fix:
    "Wait for the first signed release, or ask for another channel: GET /releases/app/latest?channel=beta.",
  app_release_conflict:
    "Version {version} ({os}) of the app is already published with another fingerprint.",
  app_release_conflict_fix:
    "Publish a new version number: a published version is never rewritten.",
  release_url_signed:
    "Redirecting to the signed binary on R2, valid for {seconds} seconds.",
  release_url_local:
    "R2 storage is not configured: this URL is local and downloads nothing.",
  seat_quota_reached:
    "Your subscription covers {quota} servers, and they are all in use.",
  seat_quota_reached_fix:
    "Add seats from the console billing page (POST /orgs/{organization}/seats), or delete a server.",
  subscription_missing: "This organization has no subscription to resize.",
  subscription_missing_fix:
    "Start the trial or order seats from /dashboard/billing.",
  seats_below_usage: "This organization already seats {used} servers.",
  seats_below_usage_fix: "Delete servers first, then lower the seat count.",
  seats_locked:
    "The seat count does not change during the trial, during the launch, or on a subscription Pupitre granted.",
  seats_locked_fix:
    "Wait for the trial to end: a paid subscription resizes from /dashboard/billing.",
  billing_launch:
    "During the launch, Pupitre grants the subscription itself: there is no payment portal.",
  billing_launch_fix:
    "Nothing to pay before the launch ends. The portal opens with the first billed subscription.",
  billing_granted:
    "Pupitre granted this subscription: there is no payment portal.",
  billing_granted_fix:
    "Nothing to pay while it runs. The portal opens with the first billed subscription.",
  subscription_not_found: "This subscription does not exist.",
  subscription_live: "This organization still has a live subscription.",
  subscription_live_fix: "Stop it first: POST /admin/subscriptions/:id/cancel.",
  platform_organization: "The Pupitre organization needs no subscription.",
  platform_organization_fix:
    "It is entitled by what it is; there is nothing to grant.",
  subscription_not_granted: "The Pupitre team did not grant this subscription.",
  subscription_not_granted_fix:
    "A Stripe subscription is resized by its owner, from the console billing page.",
  subscription_already_canceled: "This subscription is already stopped.",
  subscription_already_canceled_fix:
    "Delete it if it no longer belongs in the list: DELETE /admin/subscriptions/:id.",
  affiliate_code_taken: 'The code "{code}" is already taken.',
  affiliate_code_taken_fix: "Pick another code, or let the platform draw one.",
  affiliate_link_not_found: "This affiliate link does not exist.",
  mail_thread_not_found: "This thread does not exist.",
  mail_html_not_found: "This message has no HTML version.",
  mail_attachment_not_found: "This attachment does not exist.",
  mail_assignee_not_on_the_team:
    "This person is not a member of the Pupitre organization.",
  mail_assignee_not_on_the_team_fix:
    "Assign the thread to a team member, or leave it unassigned.",
  mail_thread_has_no_recipient: "This thread carries no address to answer.",
  mail_thread_has_no_recipient_fix:
    "Write a new message from the inbox, naming the recipient.",
  mail_send_failed: "Sending failed: {reason}",
  mail_send_failed_fix:
    "The message is kept in the thread as failed; try again, it only leaves once.",
  mail_attachment_blocked:
    'The file "{filename}" is of a type refused as an attachment.',
  mail_attachment_blocked_fix:
    "Compress it into a .zip archive before adding it.",
  mail_attachments_too_large: "The attachments exceed {limit} MiB altogether.",
  mail_attachments_too_large_fix:
    "Remove an attachment, or send it in a second message.",
  mail_upload_missing: 'The file "{filename}" never reached the bucket.',
  mail_upload_missing_fix: "Upload it again, then resend the message.",
  mail_upload_foreign:
    'The file "{filename}" was not uploaded from your session.',
  mail_upload_foreign_fix:
    "Add the attachment from this form, then resend the message.",
  mail_upload_size_mismatch:
    'The file "{filename}" is larger than what was declared.',
  mail_upload_size_mismatch_fix: "Remove it and add it again.",
  entitlement_required: "This organization has no active subscription.",
  entitlement_required_fix:
    "Start your thirty-day trial, no card needed, from /dashboard/billing.",
  server_suspended: "This organization's subscription is suspended.",
  server_suspended_fix:
    "Resume a subscription from /dashboard/billing to get your servers back.",
  organization_not_found: "This organization does not exist.",
  billing_customer_missing: "This organization has no Stripe customer yet.",
  billing_customer_missing_fix:
    "Go through checkout first: POST /orgs/{organization}/checkout.",
  stripe_signature_invalid: "Invalid Stripe signature.",
  stripe_signature_invalid_fix:
    "Sign the raw body with the webhook secret, within five minutes.",
  enrollment_unknown: "This enrollment token does not exist.",
  enrollment_used: "This enrollment token was already exchanged.",
  enrollment_expired: "This enrollment token expired.",
  enrollment_restart_fix:
    "Start the installation again from the app to get a new token.",
  internal: "Internal error (reference {ref}).",
  rate_limited: "Too many requests.",
  rate_limited_fix: "Retry in {seconds} seconds.",
  unreadable_body: "The request body is unreadable.",
  unreadable_body_fix: "Send valid JSON.",
  validation_field: 'Field "{path}" ({location}) is invalid.',
  location_body: "body",
  location_query: "query",
  location_params: "path",
  location_headers: "headers",
  location_cookie: "cookies",
  location_response: "response",
  reason_required: "This field is required.",
  reason_expected_string: "Expected: a string.",
  reason_expected_number: "Expected: a number.",
  reason_expected_integer: "Expected: an integer.",
  reason_expected_boolean: "Expected: a boolean.",
  reason_expected_object: "Expected: an object.",
  reason_expected_array: "Expected: a list.",
  reason_min_length: "Expected: at least {limit} characters.",
  reason_max_length: "Expected: at most {limit} characters.",
  reason_minimum: "Expected: a value of at least {limit}.",
  reason_maximum: "Expected: a value of at most {limit}.",
  reason_min_items: "Expected: at least {limit} items.",
  reason_max_items: "Expected: at most {limit} items.",
  reason_pattern: "The expected format is not respected.",
  reason_one_of: "Expected: one of the allowed values.",
  reason_invalid: "The value is not accepted.",
}

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { fr: FR, en: EN }

const PLACEHOLDER_RE = /\{(\w+)\}/g

export type MessageParams = Record<string, string | number>

export function translate(
  locale: Locale,
  key: MessageKey,
  params: MessageParams = {}
): string {
  return MESSAGES[locale][key].replace(PLACEHOLDER_RE, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}
