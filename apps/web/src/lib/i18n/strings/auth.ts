export const auth = {
  en: {
    "auth.signIn.title": "Sign in or sign up",
    "auth.signIn.description":
      "No account yet? It is created at your first sign-in.",
    "auth.signIn.email": "Email address",
    "auth.signIn.emailPlaceholder": "you@example.com",
    "auth.signIn.magicLink": "Send me a sign-in link",
    "auth.signIn.magicLinkPending": "Sending the link…",
    "auth.signIn.magicLinkFailed":
      "The link could not be sent. Check the address and try again.",
    "auth.signIn.sent": "A sign-in link is on its way to {email}.",
    "auth.signIn.sentFix":
      "The link is good for fifteen minutes. If nothing arrives, look in the spam folder.",
    "auth.signIn.passkey": "Use a passkey",
    "auth.signIn.passkeyPending": "Waiting for your device…",
    "auth.signIn.passkeyFailed":
      "No passkey answered. Use the sign-in link instead.",
    "auth.signIn.google": "Continue with Google",
    "auth.signIn.github": "Continue with GitHub",

    "auth.device.title": "Confirm a device",
    "auth.device.description": "Enter the code the app shows, then confirm.",
    "auth.device.codeLabel": "Code shown by the device",
    "auth.device.check": "Check the code",
    "auth.device.confirmLead":
      "A device is asking to open a session on your account. Check that this code is the one shown on the device.",
    "auth.device.foreignCode":
      "Confirm only a code your own app is showing right now.",
    "auth.device.foreignCodeFix":
      "Confirming a code someone sent you gives them your account.",
    "auth.device.confirm": "Confirm this device",
    "auth.device.deny": "Refuse",
    "auth.device.approved": "Device confirmed.",
    "auth.device.approvedFix":
      "The Pupitre app takes over in a few seconds; open it if the browser did not.",
    "auth.device.openApp": "Open the Pupitre app",
    "auth.device.denied": "Request refused.",
    "auth.device.deniedFix": "If that was not you, no session was opened.",
    "auth.device.signInAgain":
      "Confirming a device needs a sign-in less than {minutes} minutes old.",
    "auth.device.signInAgainAction": "Sign in again",

    "auth.twoFactor.title": "Second factor",
    "auth.twoFactor.description":
      "Enter the code from your authentication app.",
    "auth.twoFactor.codeLabel": "Code from the app",
    "auth.twoFactor.recoveryLabel": "Recovery code",
    "auth.twoFactor.pending": "Checking…",
    "auth.twoFactor.wrongCode": "That code does not match.",
    "auth.twoFactor.wrongRecovery":
      "That recovery code is not valid, or it has already been used.",
    "auth.twoFactor.useRecovery": "Use a recovery code",
    "auth.twoFactor.useApp": "Back to the app code",
    "auth.twoFactor.recoveryFix":
      "Each code works once. Try the next one on your list.",
    "auth.twoFactor.codeFix":
      "The codes change every thirty seconds; check the phone's clock too.",

    "auth.invitation.title": "Invitation",
    "auth.invitation.description": "Join this organisation to see its servers.",
    "auth.invitation.accept": "Accept the invitation",
    "auth.invitation.accepting": "Accepting…",
    "auth.invitation.failed":
      "This invitation could not be accepted. It may have expired.",
    "auth.invitation.failedFix":
      "Ask the organisation's administrator for a new invitation.",
    "auth.invitation.wrongEmail":
      "This invitation was sent to another address than the one you are signed in with.",
    "auth.invitation.wrongEmailFix":
      "Sign out, then open the link with the account that received the email, or ask for an invitation to this address.",
  },
  fr: {
    "auth.signIn.title": "Connexion ou inscription",
    "auth.signIn.description":
      "Pas encore de compte ? Il se crée à votre première connexion.",
    "auth.signIn.email": "Adresse email",
    "auth.signIn.emailPlaceholder": "you@example.com",
    "auth.signIn.magicLink": "Recevoir un lien de connexion",
    "auth.signIn.magicLinkPending": "Envoi du lien…",
    "auth.signIn.magicLinkFailed":
      "Le lien n'a pas pu être envoyé. Vérifiez l'adresse et réessayez.",
    "auth.signIn.sent": "Un lien de connexion part vers {email}.",
    "auth.signIn.sentFix":
      "Le lien vaut quinze minutes. Sans rien dans la boîte, regardez les indésirables.",
    "auth.signIn.passkey": "Utiliser une clé d'accès",
    "auth.signIn.passkeyPending": "En attente de votre appareil…",
    "auth.signIn.passkeyFailed":
      "Aucune clé d'accès n'a répondu. Utilisez le lien de connexion.",
    "auth.signIn.google": "Continuer avec Google",
    "auth.signIn.github": "Continuer avec GitHub",

    "auth.device.title": "Confirmer un appareil",
    "auth.device.description":
      "Entrez le code que l'app affiche, puis confirmez.",
    "auth.device.codeLabel": "Code affiché par l'appareil",
    "auth.device.check": "Vérifier le code",
    "auth.device.confirmLead":
      "Un appareil demande à ouvrir une session sur votre compte. Vérifiez que ce code est bien celui affiché sur l'appareil.",
    "auth.device.foreignCode":
      "Ne confirmez qu'un code que votre propre app affiche à l'instant.",
    "auth.device.foreignCodeFix":
      "Confirmer un code qu'on vous a envoyé donne votre compte à son auteur.",
    "auth.device.confirm": "Confirmer cet appareil",
    "auth.device.deny": "Refuser",
    "auth.device.approved": "Appareil confirmé.",
    "auth.device.approvedFix":
      "L'app Pupitre prend la main dans quelques secondes ; ouvrez-la si le navigateur ne l'a pas fait.",
    "auth.device.openApp": "Ouvrir l'app Pupitre",
    "auth.device.denied": "Demande refusée.",
    "auth.device.deniedFix":
      "Si ce n'était pas vous, aucune session n'a été ouverte.",
    "auth.device.signInAgain":
      "Confirmer un appareil demande une connexion de moins de {minutes} minutes.",
    "auth.device.signInAgainAction": "Se reconnecter",

    "auth.twoFactor.title": "Second facteur",
    "auth.twoFactor.description":
      "Entrez le code de votre application d'authentification.",
    "auth.twoFactor.codeLabel": "Code de l'application",
    "auth.twoFactor.recoveryLabel": "Code de récupération",
    "auth.twoFactor.pending": "Vérification…",
    "auth.twoFactor.wrongCode": "Ce code ne correspond pas.",
    "auth.twoFactor.wrongRecovery":
      "Ce code de récupération n'est pas valable, ou il a déjà servi.",
    "auth.twoFactor.useRecovery": "Utiliser un code de récupération",
    "auth.twoFactor.useApp": "Revenir au code de l'application",
    "auth.twoFactor.recoveryFix":
      "Chaque code ne sert qu'une fois. Essayez le suivant sur votre liste.",
    "auth.twoFactor.codeFix":
      "Les codes changent toutes les trente secondes ; vérifiez aussi l'heure du téléphone.",

    "auth.invitation.title": "Invitation",
    "auth.invitation.description":
      "Rejoignez cette organisation pour voir ses serveurs.",
    "auth.invitation.accept": "Accepter l'invitation",
    "auth.invitation.accepting": "Acceptation…",
    "auth.invitation.failed":
      "Cette invitation n'a pas pu être acceptée. Elle a peut-être expiré.",
    "auth.invitation.failedFix":
      "Demandez une nouvelle invitation à l'administrateur de l'organisation.",
    "auth.invitation.wrongEmail":
      "Cette invitation a été envoyée à une autre adresse que celle de votre session.",
    "auth.invitation.wrongEmailFix":
      "Déconnectez-vous, puis ouvrez le lien avec le compte qui a reçu l'email, ou demandez une invitation pour cette adresse.",
  },
}
