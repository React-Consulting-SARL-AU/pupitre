export const connections = {
  en: {
    "connections.state.on": "connected",
    "connections.state.off": "not connected",
    "connections.connected": "Connected as {account}.",
    "connections.held": "Token in place.",
    "connections.unsealed":
      "This computer has no system keychain the app can use: the token is held until the app quits. On Linux, install and unlock GNOME Keyring or KWallet, then restart Pupitre.",
    "connections.forget": "Disconnect",
    "connections.forgetConfirm": "Disconnect",
    "connections.forgetQuestion.unknown":
      "The token leaves this computer; every server that needs this account cannot install its services until another is connected.",
    "connections.forgetQuestion.unused":
      "The token leaves this computer. No installed service of {server} uses it today.",
    "connections.forgetQuestion.used":
      "The token leaves this computer. On {server}, {modules} use it: their next install or update will be refused until another is connected.",
    "connections.verify": "Check",
    "connections.health.checking": "asking the provider…",
    "connections.health.unaskable":
      "This provider answers no call from here: the server says at install whether the token opens anything.",
    "connections.health.answered": "answers as {account} — checked {when}",
    "connections.save": "Connect",
    "connections.required":
      "This service needs a connected account. Connect it here, then answer its questions below.",

    "connections.cloudflare.title": "Cloudflare account for tunnels",
    "connections.cloudflare.intro":
      "To put your projects on the internet, Pupitre goes through your own Cloudflare account.",
    "connections.cloudflare.tokenLabel": "API token",
    "connections.cloudflare.tokenHelp":
      "Kept in this computer's keychain. It never reaches the server: the tunnel is made from here.",
    "connections.cloudflare.tokenHint":
      "Create a token on the Cloudflare dashboard with three permissions: Account · Account Settings · Read, so Pupitre can read which account it opens; Account · Cloudflare Tunnel · Edit; and Zone · DNS · Edit on the zone your projects publish under.",

    "connections.wrangler.title": "Cloudflare account for Wrangler",
    "connections.wrangler.intro":
      "To deploy with Wrangler from the server, a second token of the same account: this one goes to the server, so it carries the deployment rights and none over your tunnels or your domain.",
    "connections.wrangler.tokenLabel": "API token",
    "connections.wrangler.tokenHelp":
      "Kept in this computer's keychain, then exported in the server's shell as CLOUDFLARE_API_TOKEN.",
    "connections.wrangler.tokenHint":
      "Create a separate token with Account · Account Settings · Read, so Pupitre can read which account it opens, then what the server deploys: Account · Workers Scripts · Edit, and D1, Pages, KV or R2 · Edit if it deploys those. No Tunnel or DNS permission.",

    "connections.github.title": "GitHub account",
    "connections.github.intro":
      "The gh command, HTTPS clones without a key, and the server's public key registered on your account.",
    "connections.github.tokenLabel": "Access token",
    "connections.github.tokenHelp": "Kept in this computer's keychain.",
    "connections.github.tokenHint":
      "A token with the repo, read:org and admin:public_key rights, so the server can clone over HTTPS and register its own key.",

    "connections.1password.title": "1Password account",
    "connections.1password.intro":
      "The op command and a service account, to produce a project's .env.local from the template its repository versions.",
    "connections.1password.tokenLabel": "Service account token",
    "connections.1password.tokenHelp":
      "Kept in this computer's keychain. The server says at install whether it opens a vault.",
    "connections.1password.tokenHint":
      "A service account token, not your main password. Create it in Developer › Service Accounts, and grant it only the vault that holds your projects' secrets.",

    "connections.neon.title": "Neon account",
    "connections.neon.intro":
      "The Neon CLI on the server, and the key it takes through NEON_API_KEY.",
    "connections.neon.tokenLabel": "API key",
    "connections.neon.tokenHelp": "Kept in this computer's keychain.",
    "connections.neon.tokenHint":
      "A personal or organisation API key, created in the Neon account settings.",

    "connections.vercel.title": "Vercel account",
    "connections.vercel.intro":
      "The Vercel CLI on the server, and the token it takes through VERCEL_TOKEN.",
    "connections.vercel.tokenLabel": "Token",
    "connections.vercel.tokenHelp": "Kept in this computer's keychain.",
    "connections.vercel.tokenHint":
      "An account token, created in Account settings › Tokens. Scope it to the team the projects live in.",

    "connections.supabase.title": "Supabase account",
    "connections.supabase.intro":
      "The Supabase CLI on the server, and the token it takes through SUPABASE_ACCESS_TOKEN.",
    "connections.supabase.tokenLabel": "Access token",
    "connections.supabase.tokenHelp": "Kept in this computer's keychain.",
    "connections.supabase.tokenHint":
      "A personal access token, created in Account › Access Tokens. It opens every organisation you belong to.",

    "connections.stripe.title": "Stripe account",
    "connections.stripe.intro":
      "The Stripe CLI on the server, and the key it takes through STRIPE_API_KEY.",
    "connections.stripe.tokenLabel": "API key",
    "connections.stripe.tokenHelp": "Kept in this computer's keychain.",
    "connections.stripe.tokenHint":
      "A restricted key, in test mode, created in Developers › API keys. Never the live secret key: the CLI listens to webhooks and forwards them, nothing more.",

    "connections.backup.title": "Backups (S3)",
    "connections.backup.intro":
      "The bucket every server of the organization sends its encrypted backups to: Cloudflare R2, AWS S3, or any S3-compatible storage.",
    "connections.backup.tokenLabel": "Secret access key",
    "connections.backup.tokenHelp": "Kept in this computer's keychain.",
    "connections.backup.tokenHint":
      "An access key limited to this bucket, with read and write rights. On R2: R2 › Manage API tokens › Object Read & Write.",

    "connections.accounts.label": "Account",
    "connections.accounts.help":
      "This token opens several accounts. Pupitre acts on one: its zones are offered for a domain, its tunnel is created, its identifier is what Wrangler deploys to.",

    "connections.zone.label": "Zone",
    "connections.zone.help": "The zone of your account the domain belongs to.",
    "connections.zone.none": "This account carries no zone.",
    "connections.zone.pick": "Choose a zone",
  },
  fr: {
    "connections.state.on": "connecté",
    "connections.state.off": "non connecté",
    "connections.connected": "Connecté en tant que {account}.",
    "connections.held": "Token en place.",
    "connections.unsealed":
      "Cet ordinateur n'a pas de trousseau système que l'app puisse utiliser : le token n'est gardé que jusqu'à la fermeture de l'app. Sous Linux, installez et déverrouillez GNOME Keyring ou KWallet, puis redémarrez Pupitre.",
    "connections.forget": "Déconnecter",
    "connections.forgetConfirm": "Déconnecter",
    "connections.forgetQuestion.unknown":
      "Le token quitte cet ordinateur ; chaque serveur qui a besoin de ce compte ne peut plus installer ses services tant qu'un autre n'est pas connecté.",
    "connections.forgetQuestion.unused":
      "Le token quitte cet ordinateur. Aucun service installé sur {server} ne l'utilise aujourd'hui.",
    "connections.forgetQuestion.used":
      "Le token quitte cet ordinateur. Sur {server}, {modules} l'utilisent : leur prochaine installation ou mise à jour sera refusée tant qu'un autre n'est pas connecté.",
    "connections.verify": "Vérifier",
    "connections.health.checking": "interrogation du fournisseur…",
    "connections.health.unaskable":
      "Ce fournisseur ne répond à aucun appel d'ici : le serveur dit à l'installation si le token ouvre quelque chose.",
    "connections.health.answered": "répond comme {account} — vérifié {when}",
    "connections.save": "Connecter",
    "connections.required":
      "Ce service a besoin d'un compte connecté. Connectez-le ici, puis répondez à ses questions ci-dessous.",

    "connections.cloudflare.title": "Compte Cloudflare pour les tunnels",
    "connections.cloudflare.intro":
      "Pour rendre vos projets accessibles sur internet, Pupitre passe par votre propre compte Cloudflare.",
    "connections.cloudflare.tokenLabel": "Token d'API",
    "connections.cloudflare.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur. Il n'atteint jamais le serveur : le tunnel se crée d'ici.",
    "connections.cloudflare.tokenHint":
      "Créez un token sur le tableau de bord Cloudflare avec trois permissions : Account · Account Settings · Read, pour que Pupitre lise quel compte il ouvre ; Account · Cloudflare Tunnel · Edit ; et Zone · DNS · Edit sur la zone sous laquelle vos projets publient.",

    "connections.wrangler.title": "Compte Cloudflare pour Wrangler",
    "connections.wrangler.intro":
      "Pour déployer avec Wrangler depuis le serveur, un second token du même compte : celui-ci part sur le serveur, il porte donc les droits de déploiement et aucun sur vos tunnels ni votre domaine.",
    "connections.wrangler.tokenLabel": "Token d'API",
    "connections.wrangler.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur, puis exporté dans le shell du serveur en CLOUDFLARE_API_TOKEN.",
    "connections.wrangler.tokenHint":
      "Créez un token distinct avec Account · Account Settings · Read, pour que Pupitre lise quel compte il ouvre, puis ce que le serveur déploie : Account · Workers Scripts · Edit, et D1, Pages, KV ou R2 · Edit s'il les déploie. Aucune permission Tunnel ni DNS.",

    "connections.github.title": "Compte GitHub",
    "connections.github.intro":
      "La commande gh, le clone HTTPS sans clé, et la clé publique du serveur enregistrée sur votre compte.",
    "connections.github.tokenLabel": "Token d'accès",
    "connections.github.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur.",
    "connections.github.tokenHint":
      "Un token avec les droits repo, read:org et admin:public_key, pour que le serveur clone en HTTPS et enregistre sa propre clé.",

    "connections.1password.title": "Compte 1Password",
    "connections.1password.intro":
      "La commande op et un compte de service, pour produire le .env.local d'un projet depuis le template que son dépôt versionne.",
    "connections.1password.tokenLabel": "Token du compte de service",
    "connections.1password.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur. Le serveur dit à l'installation s'il ouvre un coffre.",
    "connections.1password.tokenHint":
      "Un token de compte de service, pas votre mot de passe principal. Créez-le dans Développeur › Comptes de service, et n'autorisez que le coffre qui porte les secrets de vos projets.",

    "connections.neon.title": "Compte Neon",
    "connections.neon.intro":
      "Le CLI Neon sur le serveur, et la clé qu'il prend par NEON_API_KEY.",
    "connections.neon.tokenLabel": "Clé d'API",
    "connections.neon.tokenHelp": "Gardée dans le trousseau de cet ordinateur.",
    "connections.neon.tokenHint":
      "Une clé d'API personnelle ou d'organisation, créée dans les réglages du compte Neon.",

    "connections.vercel.title": "Compte Vercel",
    "connections.vercel.intro":
      "Le CLI Vercel sur le serveur, et le token qu'il prend par VERCEL_TOKEN.",
    "connections.vercel.tokenLabel": "Token",
    "connections.vercel.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur.",
    "connections.vercel.tokenHint":
      "Un token de compte, créé dans Account settings › Tokens. Limitez-le à l'équipe où vivent les projets.",

    "connections.supabase.title": "Compte Supabase",
    "connections.supabase.intro":
      "Le CLI Supabase sur le serveur, et le token qu'il prend par SUPABASE_ACCESS_TOKEN.",
    "connections.supabase.tokenLabel": "Token d'accès",
    "connections.supabase.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur.",
    "connections.supabase.tokenHint":
      "Un token d'accès personnel, créé dans Account › Access Tokens. Il ouvre toutes les organisations dont vous êtes membre.",

    "connections.stripe.title": "Compte Stripe",
    "connections.stripe.intro":
      "Le CLI Stripe sur le serveur, et la clé qu'il prend par STRIPE_API_KEY.",
    "connections.stripe.tokenLabel": "Clé d'API",
    "connections.stripe.tokenHelp":
      "Gardée dans le trousseau de cet ordinateur.",
    "connections.stripe.tokenHint":
      "Une clé restreinte, en mode test, créée dans Developers › API keys. Jamais la clé secrète de production : le CLI écoute les webhooks et les relaie, rien de plus.",

    "connections.backup.title": "Sauvegardes (S3)",
    "connections.backup.intro":
      "Le bucket où chaque serveur de l'organisation dépose ses sauvegardes chiffrées : Cloudflare R2, AWS S3, ou tout stockage compatible S3.",
    "connections.backup.tokenLabel": "Clé d'accès secrète",
    "connections.backup.tokenHelp":
      "Gardée dans le trousseau de cet ordinateur.",
    "connections.backup.tokenHint":
      "Une clé d'accès limitée à ce bucket, en lecture et écriture. Sur R2 : R2 › Manage API tokens › Object Read & Write.",

    "connections.accounts.label": "Compte",
    "connections.accounts.help":
      "Ce token ouvre plusieurs comptes. Pupitre agit sur un seul : ce sont ses zones qui sont proposées pour un domaine, son tunnel qui est créé, son identifiant sur lequel Wrangler déploie.",

    "connections.zone.label": "Zone",
    "connections.zone.help":
      "La zone de votre compte à laquelle le domaine appartient.",
    "connections.zone.none": "Ce compte ne porte aucune zone.",
    "connections.zone.pick": "Choisir une zone",
  },
} as const;
