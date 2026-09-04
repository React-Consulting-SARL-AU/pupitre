export const LOCALES = ["fr", "en"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "fr"

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

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

function parseAcceptLanguage(header: string): { locale: Locale; q: number }[] {
  return header
    .split(",")
    .map((entry) => {
      const [tag = "", ...params] = entry.trim().split(";")
      const language = tag.trim().toLowerCase().split("-")[0] ?? ""
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
      const q = quality ? Number.parseFloat(quality.slice(2)) : 1

      return { language, q: Number.isNaN(q) ? 0 : q }
    })
    .flatMap(({ language, q }) =>
      isLocale(language) && q > 0 ? [{ locale: language, q }] : []
    )
}

export function resolveLocale(headers: Headers): Locale {
  const header = headers.get("accept-language")

  if (!header) {
    return DEFAULT_LOCALE
  }

  const candidates = parseAcceptLanguage(header)
  let best: { locale: Locale; q: number } | null = null

  for (const candidate of candidates) {
    if (!best || candidate.q > best.q) {
      best = candidate
    }
  }

  return best?.locale ?? DEFAULT_LOCALE
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params: MessageParams = {}
): string {
  return MESSAGES[locale][key].replace(PLACEHOLDER_RE, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}
