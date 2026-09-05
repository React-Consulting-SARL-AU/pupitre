export const account = {
  en: {
    "account.identity.refresh": "Refresh",
    "account.identity.disconnect": "Sign out",
    "account.identity.organization": "Organisation",
    "account.identity.noOrganization": "No active organisation",
    "account.identity.device": "This device",
    "account.identity.deviceUnregistered": "Not registered",
    "account.identity.unsealed":
      "This computer's keychain would not keep the session: it will need doing again next time the app starts.",

    "account.reading.title": "Reading the account",
    "account.reading.detail": "This computer's keychain is being queried.",

    "account.gate.eyebrow": "Account",
    "account.gate.title": "Sign in to open Pupitre",
    "account.gate.body":
      "Pupitre asks for one successful sign-in, then works for seven days without the platform. Nothing running on your servers is stopped in the meantime.",
    "account.gate.settings": "Open the settings",

    "account.signIn.connect": "Sign in",
    "account.signIn.openConsole": "Open the console",
    "account.signIn.startingTitle": "Sign-in request",
    "account.signIn.startingDetail":
      "The platform is preparing a code for this device.",
    "account.signIn.waitingTitle": "Waiting for your approval",
    "account.signIn.waitingDetail":
      "Approve the code in the browser, at {url}.",
    "account.signIn.waitingNote":
      "This window updates as soon as the console has confirmed.",
    "account.signIn.codeLabel": "Code to confirm",
    "account.signIn.codeHelp":
      "This code identifies this request. It expires after thirty minutes.",
    "account.signIn.reopenBrowser": "Reopen the browser",

    "account.usage.look.development": "Development build",
    "account.usage.look.valid": "Usage right valid",
    "account.usage.look.cached": "Usage right cached",
    "account.usage.look.suspended": "Usage right suspended",
    "account.usage.look.stale": "Usage right expired",
    "account.usage.look.none": "No account connected",
    "account.usage.development":
      "Without an account, Pupitre works in development mode. A production build requires an account.",
    "account.usage.checked":
      "Checked {since}. Pupitre stays usable for seven days without the platform.",
    "account.usage.stale":
      "Last response from the platform {since}, beyond the seven days of tolerance.",
    "account.usage.suspended":
      "This organisation's servers can no longer be installed or updated.",
    "account.usage.none":
      "A production build refuses to install a server without an account.",
    "account.usage.validUntil": "valid until {date}",
  },
  fr: {
    "account.identity.refresh": "Actualiser",
    "account.identity.disconnect": "Se déconnecter",
    "account.identity.organization": "Organisation",
    "account.identity.noOrganization": "Aucune organisation active",
    "account.identity.device": "Cet appareil",
    "account.identity.deviceUnregistered": "Non enregistré",
    "account.identity.unsealed":
      "Le trousseau de cet ordinateur n'a pas accepté de garder la session : elle sera à refaire au prochain démarrage.",

    "account.reading.title": "Lecture du compte",
    "account.reading.detail": "Le trousseau de cet ordinateur est interrogé.",

    "account.gate.eyebrow": "Compte",
    "account.gate.title": "Connectez-vous pour ouvrir Pupitre",
    "account.gate.body":
      "Pupitre demande une première connexion réussie, puis travaille sept jours sans la plateforme. Rien de ce qui tourne sur vos serveurs ne s'arrête entre-temps.",
    "account.gate.settings": "Ouvrir les réglages",

    "account.signIn.connect": "Se connecter",
    "account.signIn.openConsole": "Ouvrir la console",
    "account.signIn.startingTitle": "Demande de connexion",
    "account.signIn.startingDetail":
      "La plateforme prépare un code pour cet appareil.",
    "account.signIn.waitingTitle": "En attente de votre approbation",
    "account.signIn.waitingDetail":
      "Approuvez le code dans le navigateur, sur {url}.",
    "account.signIn.waitingNote":
      "Cette fenêtre se met à jour dès que la console a confirmé.",
    "account.signIn.codeLabel": "Code à confirmer",
    "account.signIn.codeHelp":
      "Ce code identifie cette demande. Il expire au bout de trente minutes.",
    "account.signIn.reopenBrowser": "Rouvrir le navigateur",

    "account.usage.look.development": "Build de développement",
    "account.usage.look.valid": "Droit d'usage valide",
    "account.usage.look.cached": "Droit d'usage en cache",
    "account.usage.look.suspended": "Droit d'usage suspendu",
    "account.usage.look.stale": "Droit d'usage expiré",
    "account.usage.look.none": "Aucun compte connecté",
    "account.usage.development":
      "Sans compte, Pupitre travaille en mode développement. Un build de production demande un compte.",
    "account.usage.checked":
      "Vérifié {since}. Pupitre reste utilisable sept jours sans la plateforme.",
    "account.usage.stale":
      "Dernière réponse de la plateforme {since}, au-delà des sept jours de tolérance.",
    "account.usage.suspended":
      "Les serveurs de cette organisation ne peuvent plus être installés ni mis à jour.",
    "account.usage.none":
      "Un build de production refuse d'installer un serveur sans compte.",
    "account.usage.validUntil": "valable jusqu'au {date}",
  },
} as const;
