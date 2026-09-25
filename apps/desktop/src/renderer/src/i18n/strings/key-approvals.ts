export const keyApprovals = {
  en: {
    "keyApprovals.heading": "Devices to allow",
    "keyApprovals.request": "Allow {device} of {person} on {server}",
    "keyApprovals.allow": "Allow",
    "keyApprovals.allowed":
      "Allowed: {server} admits the key of {device} at its next sync.",
    "refusal.device.reauthenticate":
      "Adding this computer to the account needs a recent sign-in.",
    "refusal.device.reauthenticate.fix":
      "Sign in again, with the passkey or the second factor.",
    "refusal.keyApproval.noDeviceKey":
      "This computer has no device key to sign with.",
    "refusal.keyApproval.noDeviceKey.fix":
      "Sign in to the account on this computer: the device key is made at sign-in.",
    "refusal.keyApproval.unknown":
      "This request is no longer in the list the console sent.",
    "refusal.keyApproval.unknown.fix":
      "Open the account settings again to refresh the requests.",
    "refusal.keyApproval.notSigner":
      "{server} does not trust the key of this computer to allow other devices.",
    "refusal.keyApproval.notSigner.fix":
      "Allow the device from a computer that already opens {server}.",
    "refusal.keyApproval.mismatch":
      "The key the console sent for {device} does not match its fingerprint.",
    "refusal.keyApproval.mismatch.fix":
      "Nothing was signed. Check {device} in the console before allowing it.",
    "refusal.keyApproval.malformed":
      "The approval of {device} does not have the shape the console accepts.",
    "refusal.keyApproval.malformed.fix":
      "Nothing was sent. Update Pupitre, then allow {device} again.",
    "refusal.keyApproval.sshKeygenMissing":
      "ssh-keygen was not found on this computer.",
    "refusal.keyApproval.sshKeygenMissing.fix":
      "Install OpenSSH, then allow the device again.",
    "refusal.keyApproval.signFailed":
      "ssh-keygen could not sign the approval: {reason}",
    "refusal.keyApproval.signFailed.fix":
      "Check that the device key in the app's keys folder is readable, then allow the device again.",
  },
  fr: {
    "keyApprovals.heading": "Appareils à autoriser",
    "keyApprovals.request": "Autoriser {device} de {person} sur {server}",
    "keyApprovals.allow": "Autoriser",
    "keyApprovals.allowed":
      "Autorisé : {server} admet la clé de {device} à sa prochaine synchronisation.",
    "refusal.device.reauthenticate":
      "Ajouter cet ordinateur au compte demande une connexion récente.",
    "refusal.device.reauthenticate.fix":
      "Reconnectez-vous, avec la passkey ou le second facteur.",
    "refusal.keyApproval.noDeviceKey":
      "Cet ordinateur n'a pas de clé d'appareil pour signer.",
    "refusal.keyApproval.noDeviceKey.fix":
      "Connectez-vous au compte sur cet ordinateur : la clé d'appareil est créée à la connexion.",
    "refusal.keyApproval.unknown":
      "Cette demande n'est plus dans la liste envoyée par la console.",
    "refusal.keyApproval.unknown.fix":
      "Rouvrez les réglages du compte pour actualiser les demandes.",
    "refusal.keyApproval.notSigner":
      "{server} ne tient pas la clé de cet ordinateur pour autoriser d'autres appareils.",
    "refusal.keyApproval.notSigner.fix":
      "Autorisez l'appareil depuis un ordinateur qui ouvre déjà {server}.",
    "refusal.keyApproval.mismatch":
      "La clé envoyée par la console pour {device} ne correspond pas à son empreinte.",
    "refusal.keyApproval.mismatch.fix":
      "Rien n'a été signé. Vérifiez {device} dans la console avant de l'autoriser.",
    "refusal.keyApproval.malformed":
      "L'autorisation de {device} n'a pas la forme que la console accepte.",
    "refusal.keyApproval.malformed.fix":
      "Rien n'a été envoyé. Mettez Pupitre à jour, puis autorisez {device} à nouveau.",
    "refusal.keyApproval.sshKeygenMissing":
      "ssh-keygen est introuvable sur cet ordinateur.",
    "refusal.keyApproval.sshKeygenMissing.fix":
      "Installez OpenSSH, puis autorisez l'appareil à nouveau.",
    "refusal.keyApproval.signFailed":
      "ssh-keygen n'a pas pu signer l'autorisation : {reason}",
    "refusal.keyApproval.signFailed.fix":
      "Vérifiez que la clé d'appareil du dossier de clés de l'app est lisible, puis autorisez l'appareil à nouveau.",
  },
};
