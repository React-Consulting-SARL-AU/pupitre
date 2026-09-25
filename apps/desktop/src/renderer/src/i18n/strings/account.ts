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
      "{name} stops opening the servers of this account at the platform's next push.",
    "account.usage.openConsole": "Open the console",
    "account.usage.manageSubscription": "Manage the subscription",
    "account.usage.choosePlan": "Choose a plan",
    "account.subscription.status.trialing": "Trial in progress",
    "account.subscription.status.active": "Subscription active",
    "account.subscription.status.past_due": "Payment overdue",
    "account.subscription.status.incomplete": "Payment not completed",
    "account.subscription.status.paused": "Subscription paused",
    "account.subscription.status.unpaid": "Subscription unpaid",
    "account.subscription.status.canceled": "Subscription cancelled",
    "account.subscription.trialLeft.one": "{count} day left",
    "account.subscription.trialLeft.other": "{count} days left",
    "account.subscription.trialOver": "The trial is over",
    "account.subscription.trialEndingFix":
      "Choose a plan in the console before it ends, or your servers lose Pupitre — never their projects.",
    "account.subscription.servers": "Servers",
    "account.subscription.serversOf": "{used} of {limit} seats in use",
    "account.subscription.trialEndsOn": "Trial ends on",
    "account.subscription.renewsOn": "Renews on",
    "account.usage.title": "Subscription",
    "account.identity.title": "Account",
    "account.identity.name": "Signed in as",
    "account.identity.organization": "Organisation",
    "account.identity.noOrganization": "No active organisation",
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
    "account.gate.unsubscribed.title": "Choose a plan to open Pupitre",
    "account.gate.unsubscribed.body":
      "{org} has no subscription: Pupitre installs and updates the servers of a subscribed organization only. Choose a plan in the console, then refresh here.",
    "account.gate.suspended.title": "Subscription suspended",
    "account.gate.suspended.body":
      "{org}'s subscription is suspended: its servers can no longer be installed or updated. Settle it in the console, then refresh here.",
    "account.gate.signedInAs": "Signed in as {email}",

    "account.signIn.connect": "Sign in",
    "account.signIn.openConsole": "Open the console",
    "account.signIn.startingTitle": "Sign-in request",
    "account.signIn.startingDetail":
      "The console is preparing a code for this device.",
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
    "account.usage.look.valid": "Subscription active",
    "account.usage.look.cached": "Subscription checked offline",
    "account.usage.look.suspended": "Subscription suspended",
    "account.usage.look.unsubscribed": "No subscription",
    "account.usage.look.stale": "Check expired",
    "account.usage.look.none": "No account connected",
    "account.usage.development":
      "Without an account, Pupitre works in development mode. A production build requires an account.",
    "account.usage.checked":
      "Checked {since}. Pupitre stays usable for seven days offline.",
    "account.usage.stale":
      "Last check {since}, beyond the seven days of tolerance.",
    "account.usage.suspended":
      "This organisation's servers can no longer be installed or updated.",
    "account.usage.unsubscribed":
      "This organisation's servers cannot be installed or updated until it holds a plan.",
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
      "{name} cesse d'ouvrir les serveurs de ce compte au prochain push de la plateforme.",
    "account.usage.openConsole": "Ouvrir la console",
    "account.usage.manageSubscription": "Gérer l'abonnement",
    "account.usage.choosePlan": "Choisir une offre",
    "account.subscription.status.trialing": "Essai en cours",
    "account.subscription.status.active": "Abonnement actif",
    "account.subscription.status.past_due": "Paiement en retard",
    "account.subscription.status.incomplete": "Paiement non abouti",
    "account.subscription.status.paused": "Abonnement en pause",
    "account.subscription.status.unpaid": "Abonnement impayé",
    "account.subscription.status.canceled": "Abonnement résilié",
    "account.subscription.trialLeft.one": "{count} jour restant",
    "account.subscription.trialLeft.other": "{count} jours restants",
    "account.subscription.trialOver": "L'essai est terminé",
    "account.subscription.trialEndingFix":
      "Choisissez une offre dans la console avant la fin, sinon vos serveurs perdent Pupitre — jamais leurs projets.",
    "account.subscription.servers": "Serveurs",
    "account.subscription.serversOf": "{used} sièges sur {limit} occupés",
    "account.subscription.trialEndsOn": "Fin de l'essai le",
    "account.subscription.renewsOn": "Renouvellement le",
    "account.usage.title": "Abonnement",
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
    "account.gate.unsubscribed.title":
      "Choisissez une offre pour ouvrir Pupitre",
    "account.gate.unsubscribed.body":
      "{org} n'a pas d'abonnement : Pupitre n'installe et ne met à jour que les serveurs d'une organisation abonnée. Choisissez une offre dans la console, puis actualisez ici.",
    "account.gate.suspended.title": "Abonnement suspendu",
    "account.gate.suspended.body":
      "L'abonnement de {org} est suspendu : ses serveurs ne peuvent plus être installés ni mis à jour. Régularisez-le dans la console, puis actualisez ici.",
    "account.gate.signedInAs": "Connecté en tant que {email}",

    "account.signIn.connect": "Se connecter",
    "account.signIn.openConsole": "Ouvrir la console",
    "account.signIn.startingTitle": "Demande de connexion",
    "account.signIn.startingDetail":
      "La console prépare un code pour cet appareil.",
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
    "account.usage.look.valid": "Abonnement actif",
    "account.usage.look.cached": "Abonnement vérifié hors ligne",
    "account.usage.look.suspended": "Abonnement suspendu",
    "account.usage.look.unsubscribed": "Aucun abonnement",
    "account.usage.look.stale": "Vérification expirée",
    "account.usage.look.none": "Aucun compte connecté",
    "account.usage.development":
      "Sans compte, Pupitre travaille en mode développement. Un build de production demande un compte.",
    "account.usage.checked":
      "Vérifié {since}. Pupitre reste utilisable sept jours sans connexion.",
    "account.usage.stale":
      "Dernière vérification {since}, au-delà des sept jours de tolérance.",
    "account.usage.suspended":
      "Les serveurs de cette organisation ne peuvent plus être installés ni mis à jour.",
    "account.usage.unsubscribed":
      "Les serveurs de cette organisation ne pourront être installés ni mis à jour tant qu'elle n'a pas d'offre.",
    "account.usage.none":
      "Aucun serveur ne peut être installé ni mis à jour tant qu'aucun compte n'est connecté.",
    "account.usage.validUntil": "valable jusqu'au {date}",
  },
} as const;
