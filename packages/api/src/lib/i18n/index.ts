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
  entitlement_required: "Cette organisation n'a aucun abonnement en cours.",
  entitlement_required_fix:
    "Démarrez votre essai de quatorze jours, sans carte, depuis /dashboard/billing.",
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
  entitlement_required: "This organization has no active subscription.",
  entitlement_required_fix:
    "Start your fourteen-day trial, no card needed, from /dashboard/billing.",
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
