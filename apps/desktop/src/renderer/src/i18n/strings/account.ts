export const account = {
  en: {
    "account.identity.refresh": "Refresh",
    "account.identity.disconnect": "Sign out",
    "account.identity.disconnectQuestion":
      "The servers stay on this computer and their sessions keep running; the app drives no server until the next sign-in.",
    "account.devices.heading": "Devices",
    "account.devices.none": "No device is registered.",
    "account.devices.thisComputer": "this computer",
    "account.devices.self": "signed in here",
    "account.devices.revoke": "Revoke",
    "account.devices.revokeQuestion":
      "{name} stops opening the servers of this account at the console's next push.",
    "account.usage.openConsole": "Open the console",
    "account.usage.contactSupport": "Contact support",
    "account.license.status.active": "Licence active",
    "account.license.status.past_due": "Licence payment overdue",
    "account.license.status.incomplete": "Licence payment not completed",
    "account.license.status.paused": "Licence paused",
    "account.license.status.unpaid": "Licence unpaid",
    "account.license.status.canceled": "Licence cancelled",
    "account.license.servers": "Servers",
    "account.license.serversOf": "{used} of {limit} servers in use",
    "account.license.freeTier":
      "Free up to {free} servers per organization; a licence is required beyond. Contact {support}.",
    "account.license.seats.one": "{count} server added to the free ones",
    "account.license.seats.other": "{count} servers added to the free ones",
    "account.license.endsOn": "Licence valid until",
    "account.usage.title": "Licence",
    "account.identity.title": "Account",
    "account.identity.name": "Signed in as",
    "account.identity.organization": "Organization",
    "account.identity.noOrganization": "No active organization",
    "account.identity.unsealed":
      "This computer has no system keychain the app can use: the session will need doing again next time the app starts. On Linux, install and unlock GNOME Keyring or KWallet, then restart Pupitre.",

    "account.reading.title": "Reading the account",
    "account.read.failed": "The account could not be read.",
    "account.read.failed.fix":
      "This computer's keychain did not answer. Try again; if it keeps refusing, quit and reopen the app.",

    "account.gate.eyebrow": "Account",
    "account.gate.title": "Sign in to open Pupitre",
    "account.gate.body":
      "One sign-in, then Pupitre works for seven days without the console.",
    "account.gate.lead": "Your AI agents work on a machine of their own.",
    "account.gate.platform": "Console",
    "account.gate.settings": "Open the settings",
    "account.gate.developmentSkip": "Continue without an account",
    "account.gate.unlicensed.title": "Licence required",
    "account.gate.unlicensed.body":
      "{org} has {used} servers: Pupitre is free up to {free} servers, a licence is required beyond. Contact {support}, then refresh here.",
    "account.gate.suspended.title": "Organization suspended",
    "account.gate.suspended.body":
      "The platform has suspended {org}: its servers can no longer be installed or updated. Contact {support}, then refresh here.",
    "account.gate.signedInAs": "Signed in as {email}",

    "account.signIn.connect": "Sign in",
    "account.signIn.openConsole": "Open the console",
    "account.signIn.startingTitle": "Sign-in request",
    "account.signIn.startingDetail":
      "The console is preparing a code for this computer.",
    "account.signIn.step.browser": "The browser has opened on {url}.",
    "account.signIn.step.approve":
      "Check that the code over there is the one below, and approve it.",
    "account.signIn.step.back":
      "This window updates as soon as the console has confirmed.",
    "account.signIn.codeLabel": "Waiting for your approval",
    "account.signIn.codeHelp": "Expires after thirty minutes.",
    "account.signIn.reopenBrowser": "Reopen the browser",
    "account.signIn.cancel": "Cancel signing in",

    "account.usage.look.development": "Development build",
    "account.usage.look.valid": "Licence valid",
    "account.usage.look.cached": "Licence checked offline",
    "account.usage.look.suspended": "Organization suspended",
    "account.usage.look.unlicensed": "Licence required",
    "account.usage.look.stale": "Check expired",
    "account.usage.look.none": "No account connected",
    "account.usage.development":
      "Without an account, Pupitre works in development mode. A production build requires an account.",
    "account.usage.checked":
      "Checked {since}. Pupitre stays usable for seven days offline.",
    "account.usage.stale":
      "Last check {since}, beyond the seven days of tolerance.",
    "account.usage.stale.fix":
      "Connect this computer to the internet, then refresh the account: the console checks the licence again.",
    "account.usage.suspended":
      "The platform has suspended this organization: its servers can no longer be installed or updated.",
    "account.usage.unlicensed":
      "This organization has {used} servers for {free} free: its servers cannot be installed or updated until it holds a licence. Contact {support}.",
    "account.usage.none":
      "No server can be installed or updated until an account is connected.",
    "account.usage.validUntil": "valid until {date}",
  },
  fr: {
    "account.identity.refresh": "Actualiser",
    "account.identity.disconnect": "Se déconnecter",
    "account.identity.disconnectQuestion":
      "Les serveurs restent sur cet ordinateur et leurs sessions continuent ; l'app ne pilote plus aucun serveur avant la prochaine connexion.",
    "account.devices.heading": "Appareils",
    "account.devices.none": "Aucun appareil n'est enregistré.",
    "account.devices.thisComputer": "cet ordinateur",
    "account.devices.self": "connecté ici",
    "account.devices.revoke": "Révoquer",
    "account.devices.revokeQuestion":
      "{name} cesse d'ouvrir les serveurs de ce compte au prochain push de la console.",
    "account.usage.openConsole": "Ouvrir la console",
    "account.usage.contactSupport": "Écrire au support",
    "account.license.status.active": "Licence active",
    "account.license.status.past_due": "Paiement de la licence en retard",
    "account.license.status.incomplete": "Paiement de la licence non abouti",
    "account.license.status.paused": "Licence en pause",
    "account.license.status.unpaid": "Licence impayée",
    "account.license.status.canceled": "Licence résiliée",
    "account.license.servers": "Serveurs",
    "account.license.serversOf": "{used} sur {limit} serveurs utilisés",
    "account.license.freeTier":
      "Gratuit jusqu'à {free} serveurs par organisation ; une licence est requise au-delà. Écrivez à {support}.",
    "account.license.seats.one": "{count} serveur ajouté aux gratuits",
    "account.license.seats.other": "{count} serveurs ajoutés aux gratuits",
    "account.license.endsOn": "Licence valable jusqu'au",
    "account.usage.title": "Licence",
    "account.identity.title": "Compte",
    "account.identity.name": "Connecté en tant que",
    "account.identity.organization": "Organisation",
    "account.identity.noOrganization": "Aucune organisation active",
    "account.identity.unsealed":
      "Cet ordinateur n'a pas de trousseau système que l'app puisse utiliser : la session sera à refaire au prochain démarrage. Sous Linux, installez et déverrouillez GNOME Keyring ou KWallet, puis redémarrez Pupitre.",

    "account.reading.title": "Lecture du compte",
    "account.read.failed": "Le compte n'a pas pu être lu.",
    "account.read.failed.fix":
      "Le trousseau de cet ordinateur n'a pas répondu. Réessayez ; s'il refuse encore, quittez et rouvrez l'app.",

    "account.gate.eyebrow": "Compte",
    "account.gate.title": "Connectez-vous pour ouvrir Pupitre",
    "account.gate.body":
      "Une connexion, puis Pupitre travaille sept jours sans la console.",
    "account.gate.lead": "Vos agents IA travaillent sur une machine à eux.",
    "account.gate.platform": "Console",
    "account.gate.settings": "Ouvrir les réglages",
    "account.gate.developmentSkip": "Continuer sans compte",
    "account.gate.unlicensed.title": "Licence requise",
    "account.gate.unlicensed.body":
      "{org} a {used} serveurs : Pupitre est gratuit jusqu'à {free} serveurs, une licence est requise au-delà. Écrivez à {support}, puis actualisez ici.",
    "account.gate.suspended.title": "Organisation suspendue",
    "account.gate.suspended.body":
      "La plateforme a suspendu {org} : ses serveurs ne peuvent plus être installés ni mis à jour. Écrivez à {support}, puis actualisez ici.",
    "account.gate.signedInAs": "Connecté en tant que {email}",

    "account.signIn.connect": "Se connecter",
    "account.signIn.openConsole": "Ouvrir la console",
    "account.signIn.startingTitle": "Demande de connexion",
    "account.signIn.startingDetail":
      "La console prépare un code pour cet ordinateur.",
    "account.signIn.step.browser": "Le navigateur s'est ouvert sur {url}.",
    "account.signIn.step.approve":
      "Vérifiez que le code affiché là-bas est celui ci-dessous, et approuvez-le.",
    "account.signIn.step.back":
      "Cette fenêtre se met à jour dès que la console a confirmé.",
    "account.signIn.codeLabel": "En attente de votre approbation",
    "account.signIn.codeHelp": "Expire au bout de trente minutes.",
    "account.signIn.reopenBrowser": "Rouvrir le navigateur",
    "account.signIn.cancel": "Annuler la connexion",

    "account.usage.look.development": "Build de développement",
    "account.usage.look.valid": "Licence valide",
    "account.usage.look.cached": "Licence vérifiée hors ligne",
    "account.usage.look.suspended": "Organisation suspendue",
    "account.usage.look.unlicensed": "Licence requise",
    "account.usage.look.stale": "Vérification expirée",
    "account.usage.look.none": "Aucun compte connecté",
    "account.usage.development":
      "Sans compte, Pupitre travaille en mode développement. Un build de production demande un compte.",
    "account.usage.checked":
      "Vérifié {since}. Pupitre reste utilisable sept jours sans connexion.",
    "account.usage.stale":
      "Dernière vérification {since}, au-delà des sept jours de tolérance.",
    "account.usage.stale.fix":
      "Reconnectez cet ordinateur à internet, puis actualisez le compte : la console revérifie la licence.",
    "account.usage.suspended":
      "La plateforme a suspendu cette organisation : ses serveurs ne peuvent plus être installés ni mis à jour.",
    "account.usage.unlicensed":
      "Cette organisation a {used} serveurs pour {free} gratuits : ses serveurs ne pourront être installés ni mis à jour tant qu'elle n'a pas de licence. Écrivez à {support}.",
    "account.usage.none":
      "Aucun serveur ne peut être installé ni mis à jour tant qu'aucun compte n'est connecté.",
    "account.usage.validUntil": "valable jusqu'au {date}",
  },
} as const;
