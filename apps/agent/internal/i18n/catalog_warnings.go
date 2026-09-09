package i18n

// A step's warnings: what was not done, and what the machine keeps anyway.
var warningCatalog = map[string]Message{
	"warn.engine.state.unreadable": {
		FR: "état illisible, mise à jour ignorée : %s",
		EN: "the state cannot be read, the update was skipped: %s",
	},
	"cloudflared.tunnel.unknown": {
		FR: "Cloudflare ne connaît plus ce tunnel. Rejouez ce service depuis l'app : elle en refera un et réécrira les identifiants du serveur.",
		EN: "Cloudflare no longer knows this tunnel. Replay this service from the app: it makes a new one and rewrites the server's credentials.",
	},
	"warn.cloudflare.tunnel.unready": {
		FR: "le tunnel n'est pas encore connecté à Cloudflare, il continue d'essayer : %s",
		EN: "the tunnel is not connected to Cloudflare yet and keeps trying: %s",
	},
	"warn.cloudflare.dns.refused": {
		FR: "%d enregistrement(s) DNS refusé(s) par Cloudflare : vérifie les droits DNS du jeton sur la zone %s",
		EN: "%d DNS record(s) refused by Cloudflare: check the token's DNS rights on zone %s",
	},
	"warn.caddy.ufw.refused": {
		FR: "règle ufw %s refusée : ouvre-la à la main, sinon les certificats ne seront pas émis",
		EN: "ufw rule %s was refused: open it by hand, or no certificate will be issued",
	},
	"warn.system.swap.failed": {
		FR: "swap non créé : %s",
		EN: "the swap file was not created: %s",
	},
	"warn.system.unit.stop.failed": {
		FR: "unité %s non arrêtée : %s",
		EN: "unit %s was not stopped: %s",
	},
	"warn.java.home.missing": {
		FR: "JAVA_HOME introuvable, à vérifier avant de compiler un projet JVM",
		EN: "JAVA_HOME was not found, worth checking before building a JVM project",
	},
	"warn.node.corepack.missing": {
		FR: "corepack indisponible, pnpm gardera sa version globale : %s",
		EN: "corepack is unavailable, pnpm will keep its global version: %s",
	},
	"warn.ruby.bundler.failed": {
		FR: "bundler non installé, la version livrée avec Ruby reste en place : %s",
		EN: "bundler was not installed, the one shipped with Ruby stays in place: %s",
	},
	"warn.browser.none": {
		FR: "aucun navigateur sans interface : shot <url> restera indisponible, shot <fichier> marche",
		EN: "no headless browser: shot <url> stays unavailable, shot <file> works",
	},
	"warn.browser.libraries.missing": {
		FR: "bibliothèques Playwright absenvos de cette version d'Ubuntu : %s",
		EN: "Playwright libraries missing from this Ubuntu version: %s",
	},
	"warn.dumps.dir.unreadable": {
		FR: "dossier %s illisible, aucun dump importé : %s",
		EN: "folder %s cannot be read, no dump was imported: %s",
	},
	"warn.dumps.name.refused": {
		FR: "%s ignoré : le nom de base qu'il porte n'est pas utilisable",
		EN: "%s was skipped: the database name it carries cannot be used",
	},
	"warn.postgres.hba.missing": {
		FR: "%s est absent : le cluster n'a pas été créé par le paquet, les accès restent ceux de la machine",
		EN: "%s is missing: the cluster was not created by the package, access stays as the machine has it",
	},
	"warn.mysql.fallback": {
		FR: "%s installé à la place de %s : compatible avec la plupart des clients, mais ce n'est pas le même moteur",
		EN: "%s was installed instead of %s: compatible with most clients, but it is not the same engine",
	},
	"warn.vscode.extension.refused": {
		FR: "extension refusée par la place de marché : %s",
		EN: "the marketplace refused this extension: %s",
	},
	"warn.vscode.tunnel.login": {
		FR: "le tunnel VS Code attend une authentification une fois : sudo -u dev %s tunnel user login",
		EN: "the VS Code tunnel expects one sign-in: sudo -u dev %s tunnel user login",
	},
	"warn.onepassword.vault.none": {
		FR: "op est installé mais le jeton n'ouvre aucun coffre : les .env.local retomberont sur le .env.example des dépôts",
		EN: "op is installed but the token opens no vault: .env.local files will fall back on the repositories' .env.example",
	},
	"warn.github.key.refused": {
		FR: "clé du serveur non enregistrée sur GitHub : il manque probablement le droit admin:public_key au jeton",
		EN: "the server's key was not registered on GitHub: the token is probably missing the admin:public_key right",
	},
}
