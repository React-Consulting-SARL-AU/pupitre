package i18n

var uninstallCatalog = map[string]Message{
	"uninstall.usage": {
		FR: "usage : sudo pupitred uninstall [--yes]",
		EN: "usage: sudo pupitred uninstall [--yes]",
	},
	"uninstall.root": {
		FR: "uninstall retire des services et des fichiers qui appartiennent à root : lancez-le en root, `sudo pupitred uninstall`",
		EN: "uninstall removes services and files that belong to root: run it as root, `sudo pupitred uninstall`",
	},
	"uninstall.terminal": {
		FR: "uninstall demande une confirmation sur un terminal, et l'entrée standard n'en est pas un : ajoutez --yes, `sudo pupitred uninstall --yes`",
		EN: "uninstall asks for confirmation on a terminal, and standard input is not one: add --yes, `sudo pupitred uninstall --yes`",
	},
	"uninstall.removes": {
		FR: "Retiré de ce serveur :",
		EN: "Removed from this server:",
	},
	"uninstall.keeps": {
		FR: "Gardé :",
		EN: "Kept:",
	},
	"uninstall.confirm": {
		FR: "Retirer l'agent Pupitre de ce serveur ? [o/N] ",
		EN: "Remove the Pupitre agent from this server? [y/N] ",
	},
	"uninstall.declined": {
		FR: "Rien n'a été retiré.",
		EN: "Nothing was removed.",
	},
	"uninstall.nothing": {
		FR: "Il ne reste rien de l'agent Pupitre à retirer sur ce serveur.",
		EN: "Nothing of the Pupitre agent is left to remove on this server.",
	},
	"uninstall.unit.stopped": {
		FR: "le service %s : arrêté, désactivé, son unité supprimée",
		EN: "the %s service: stopped, disabled, its unit deleted",
	},
	"uninstall.unit.resume": {
		FR: "le service %s : désactivé et son unité supprimée, sans l'arrêter — les projets qu'il a lancés tournent jusqu'au prochain redémarrage, après quoi plus rien ne les lance",
		EN: "the %s service: disabled and its unit deleted, without stopping it — the projects it started run until the next reboot, after which nothing starts them",
	},
	"uninstall.command": {
		FR: "la commande %s, qui est l'agent",
		EN: "the %s command, which is the agent",
	},
	"uninstall.binary": {
		FR: "l'agent, %s",
		EN: "the agent, %s",
	},
	"uninstall.binary.kept": {
		FR: "%s est gardé pour relancer la commande une fois les échecs ci-dessus réglés",
		EN: "%s is kept so the command can run again once the failures above are fixed",
	},
	"uninstall.sudo": {
		FR: "les deux lignes sans mot de passe de pupitred dans %s : dev garde sudo sur son mot de passe",
		EN: "the two passwordless pupitred lines of %s: dev keeps sudo on its password",
	},
	"uninstall.config": {
		FR: "%s, sauf %s",
		EN: "%s, except %s",
	},
	"uninstall.state": {
		FR: "%s, l'état de l'agent",
		EN: "%s, the agent's state",
	},
	"uninstall.logs": {
		FR: "%s et ses copies tournées",
		EN: "%s and its rotated copies",
	},
	"uninstall.rotation": {
		FR: "%s, la rotation de ce journal",
		EN: "%s, the rotation of that journal",
	},
	"uninstall.keep.services": {
		FR: "chaque paquet et service installé, les bases de données et leurs données",
		EN: "every installed package and service, the databases and their data",
	},
	"uninstall.keep.dev": {
		FR: "l'utilisateur dev et /home/dev : vos projets, leurs sessions tmux, la configuration du shell",
		EN: "the dev user and /home/dev: your projects, their tmux sessions, the shell configuration",
	},
	"uninstall.keep.exposure": {
		FR: "les configurations de Caddy et de cloudflared, et le bloc des projets dans /etc/hosts",
		EN: "the Caddy and cloudflared configurations, and the projects' block in /etc/hosts",
	},
	"uninstall.keep.hardening": {
		FR: "la sécurisation : ufw, fail2ban, /etc/ssh/sshd_config.d, /etc/sysctl.d",
		EN: "the hardening: ufw, fail2ban, /etc/ssh/sshd_config.d, /etc/sysctl.d",
	},
	"uninstall.keep.keys": {
		FR: "chaque clé de l'authorized_keys de dev, le bloc des appareils Pupitre compris",
		EN: "every key in dev's authorized_keys, the Pupitre devices' block included",
	},
	"uninstall.keep.env": {
		FR: "%s, lisible par root seul : les mots de passe et jetons de vos services",
		EN: "%s, readable by root only: the passwords and tokens of your services",
	},
	"uninstall.keep.sudo.password": {
		FR: "la règle sudo de %s : dev garde sudo sur son mot de passe",
		EN: "the sudo rule of %s: dev keeps sudo on its password",
	},
	"uninstall.keep.sudo.open": {
		FR: "la règle sudo de %s telle quelle : dev garde sudo sans mot de passe, comme avant que la sécurisation en demande un",
		EN: "the sudo rule of %s as it is: dev keeps sudo without a password, as before the hardening asked for one",
	},
	"uninstall.keep.sudo.other": {
		FR: "la règle sudo de %s telle quelle, que Pupitre n'a pas écrite",
		EN: "the sudo rule of %s as it is, which Pupitre did not write",
	},
	"uninstall.fix": {
		FR: "à la main : %s",
		EN: "by hand: %s",
	},
	"uninstall.done": {
		FR: "L'agent Pupitre est retiré de ce serveur.",
		EN: "The Pupitre agent is removed from this server.",
	},
	"uninstall.failed": {
		FR: "%d étape(s) en échec. Faites ce que chacune indique, puis relancez `sudo pupitred uninstall`.",
		EN: "%d step(s) failed. Do what each one says, then run `sudo pupitred uninstall` again.",
	},
	"uninstall.seat": {
		FR: "Le serveur occupe encore un siège : supprimez-le dans l'app (Réglages › Serveurs) ou dans la console (Serveurs › Supprimer le serveur) pour le libérer.",
		EN: "The server still holds a seat: delete it in the app (Settings › Servers) or in the console (Servers › Delete the server) to free it.",
	},
}
