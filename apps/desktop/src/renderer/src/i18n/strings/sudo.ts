export const sudo = {
  en: {
    "sudo.password.label": "Sudo password of dev",
    "sudo.password.reveal": "Show the sudo password of dev",
    "sudo.password.hide": "Hide the sudo password of dev",
    "sudo.password.copy": "Copy the sudo password of dev",
    "sudo.password.copied": "Sudo password of dev copied",
    "sudo.password.kept": "In this computer's keychain",
    "sudo.password.unkept":
      "Forgotten when the app quits: this computer has no keychain",
    "sudo.password.absent": "Not on this computer",
    "sudo.password.enter": "Enter the sudo password of dev",
    "sudo.enter.help":
      "The app of a computer that keeps it shows it in Settings › Servers. Lost everywhere: set a new one from the hosting console with passwd dev.",
    "sudo.enter.confirm": "Keep on this computer",
    "sudo.outcome.title": "Sudo asks dev for a password",
    "sudo.outcome.detail":
      "Only pupitred runs as root without it: every other sudo command on this server asks for the password below.",
    "sudo.outcome.unkept":
      "This computer has no keychain: the app forgets the sudo password of dev when it quits. Write it down now.",
    "sudo.notice.message":
      "On this server, dev still becomes root without a password.",
    "sudo.notice.fix":
      "Run the securing again: it gives dev a sudo password, kept on this computer.",
  },
  fr: {
    "sudo.password.label": "Mot de passe sudo de dev",
    "sudo.password.reveal": "Afficher le mot de passe sudo de dev",
    "sudo.password.hide": "Masquer le mot de passe sudo de dev",
    "sudo.password.copy": "Copier le mot de passe sudo de dev",
    "sudo.password.copied": "Mot de passe sudo de dev copié",
    "sudo.password.kept": "Dans le trousseau de cet ordinateur",
    "sudo.password.unkept":
      "Oublié à la fermeture de l'app : cet ordinateur n'a pas de trousseau",
    "sudo.password.absent": "Pas sur cet ordinateur",
    "sudo.password.enter": "Saisir le mot de passe sudo de dev",
    "sudo.enter.help":
      "L'app d'un ordinateur qui le garde le montre dans Réglages › Serveurs. Perdu partout : posez-en un nouveau depuis la console de l'hébergeur avec passwd dev.",
    "sudo.enter.confirm": "Garder sur cet ordinateur",
    "sudo.outcome.title": "Sudo demande un mot de passe à dev",
    "sudo.outcome.detail":
      "Seul pupitred passe root sans lui : toute autre commande sudo sur ce serveur demande le mot de passe ci-dessous.",
    "sudo.outcome.unkept":
      "Cet ordinateur n'a pas de trousseau : l'app oublie le mot de passe sudo de dev en quittant. Notez-le maintenant.",
    "sudo.notice.message":
      "Sur ce serveur, dev devient encore root sans mot de passe.",
    "sudo.notice.fix":
      "Relancez la sécurisation : elle donne à dev un mot de passe sudo, gardé sur cet ordinateur.",
  },
} as const;
