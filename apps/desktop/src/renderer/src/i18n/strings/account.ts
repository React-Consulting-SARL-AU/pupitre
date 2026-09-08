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
      "Pupitre asks for one successful sign-in, then works for seven days without the console. Nothing running on your servers is stopped in the meantime.",
    "account.gate.lead": "Your AI agents work on a machine of their own.",
    "account.gate.promise.machine":
      "A server you own, taken in hand in a few minutes: services, projects, terminals, agents.",
    "account.gate.promise.offline":
      "One sign-in, then seven days without the console. Your servers never stop.",
    "account.gate.promise.keys":
      "The private keys stay on this computer, and nothing readable is left on the server.",
    "account.gate.platform": "Console",
    "account.gate.settings": "Open the settings",
    "account.gate.developmentSkip": "Continue without an account",

    "account.signIn.connect": "Sign in",
    "account.signIn.openConsole": "Open the console",
    "account.signIn.howItWorks":
      "The browser opens on the console, you approve the code shown here, and this window carries on by itself.",
    "account.signIn.startingTitle": "Sign-in request",
    "account.signIn.startingDetail":
      "The console is preparing a code for this device.",
    "account.signIn.step.browser": "The browser has opened on {url}.",
    "account.signIn.step.approve":
      "Check that the code over there is the one below, and approve it.",
    "account.signIn.step.back":
      "This window updates as soon as the console has confirmed.",
    "account.signIn.codeLabel": "Waiting for your approval",
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
      "Checked {since}. Pupitre stays usable for seven days without the console.",
    "account.usage.stale":
      "Last response from the console {since}, beyond the seven days of tolerance.",
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
      "Pupitre demande une première connexion réussie, puis travaille sept jours sans la console. Rien de ce qui tourne sur vos serveurs ne s'arrête entre-temps.",
    "account.gate.lead": "Vos agents IA travaillent sur une machine à eux.",
    "account.gate.promise.machine":
      "Un serveur à vous, pris en main en quelques minutes : services, projets, terminaux, agents.",
    "account.gate.promise.offline":
      "Une connexion, puis sept jours sans la console. Vos serveurs ne s'arrêtent jamais.",
    "account.gate.promise.keys":
      "Les clés privées restent sur cet ordinateur, et rien de lisible n'est déposé sur le serveur.",
    "account.gate.platform": "Console",
    "account.gate.settings": "Ouvrir les réglages",
    "account.gate.developmentSkip": "Continuer sans compte",

    "account.signIn.connect": "Se connecter",
    "account.signIn.openConsole": "Ouvrir la console",
    "account.signIn.howItWorks":
      "Le navigateur s'ouvre sur la console, vous approuvez le code affiché ici, et cette fenêtre continue toute seule.",
    "account.signIn.startingTitle": "Demande de connexion",
    "account.signIn.startingDetail":
      "La console prépare un code pour cet appareil.",
    "account.signIn.step.browser": "Le navigateur s'est ouvert sur {url}.",
    "account.signIn.step.approve":
      "Vérifiez que le code affiché là-bas est celui ci-dessous, et approuvez-le.",
    "account.signIn.step.back":
      "Cette fenêtre se met à jour dès que la console a confirmé.",
    "account.signIn.codeLabel": "En attente de votre approbation",
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
      "Vérifié {since}. Pupitre reste utilisable sept jours sans la console.",
    "account.usage.stale":
      "Dernière réponse de la console {since}, au-delà des sept jours de tolérance.",
    "account.usage.suspended":
      "Les serveurs de cette organisation ne peuvent plus être installés ni mis à jour.",
    "account.usage.none":
      "Un build de production refuse d'installer un serveur sans compte.",
    "account.usage.validUntil": "valable jusqu'au {date}",
  },
} as const;
