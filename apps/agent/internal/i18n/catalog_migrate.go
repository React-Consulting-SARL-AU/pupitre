package i18n

var migrateCatalog = map[string]Message{
	"migrate.required.pending": {
		FR: "la configuration de ce serveur est en révision %d, cet agent en attend %d",
		EN: "this server's configuration is at revision %d, this agent expects %d",
	},
	"migrate.required.pending.fix": {
		FR: "Lancez la migration depuis l'app, ou `sudo pupitred migrate` sur le serveur.",
		EN: "Run the migration from the app, or `sudo pupitred migrate` on the server.",
	},
	"migrate.required.failed": {
		FR: "une migration de configuration a échoué : la configuration a été remise en l'état, et rien ne sera piloté sur ce serveur avant qu'elle passe",
		EN: "a configuration migration failed: the configuration was put back as it was, and nothing will be driven on this server until it goes through",
	},
	"migrate.required.failed.fix": {
		FR: "Lisez `sudo pupitred migrate --status` sur le serveur, puis relancez `sudo pupitred migrate`.",
		EN: "Read `sudo pupitred migrate --status` on the server, then run `sudo pupitred migrate` again.",
	},
	"migrate.required.ahead": {
		FR: "la configuration de ce serveur est en révision %d, cet agent n'en lit que %d : il est plus ancien que celui qui l'a configuré",
		EN: "this server's configuration is at revision %d and this agent only reads %d: it is older than the one that configured it",
	},
	"migrate.required.ahead.fix": {
		FR: "Installez un agent au moins aussi récent, ou revenez en arrière avec `sudo pupitred migrate --restore=<sauvegarde>`.",
		EN: "Install an agent at least as recent, or go back with `sudo pupitred migrate --restore=<backup>`.",
	},
	"migrate.busy": {
		FR: "une installation est en cours sur ce serveur : la migration attend qu'elle finisse",
		EN: "an install is running on this server: the migration waits for it to finish",
	},
	"migrate.busy.fix": {
		FR: "Relancez la migration quand l'installation en cours est terminée.",
		EN: "Run the migration again once the install under way has finished.",
	},
	"migrate.ledger.unreadable": {
		FR: "le registre des migrations %s est illisible (%s) : sans lui, l'agent ne sait pas quelle forme a la configuration, et n'y touche pas",
		EN: "the migration ledger %s cannot be read (%s): without it the agent cannot tell what shape the configuration has, and leaves it alone",
	},
	"migrate.ledger.unreadable.fix": {
		FR: "Remettez-le d'une sauvegarde de configuration : `sudo pupitred migrate --status` les liste, `sudo pupitred migrate --restore=<sauvegarde>` en remet une. Sans sauvegarde, supprimez %s pour que toutes les migrations soient rejouées depuis le début.",
		EN: "Put it back from a configuration backup: `sudo pupitred migrate --status` lists them, `sudo pupitred migrate --restore=<backup>` puts one back. Without one, remove %s so that every migration is replayed from the start.",
	},
	"migrate.backup.unknown": {
		FR: "sauvegarde de configuration inconnue : %s",
		EN: "unknown configuration backup: %s",
	},
	"migrate.backup.unknown.fix": {
		FR: "Listez celles que la machine garde avec `sudo pupitred migrate --status`.",
		EN: "List the ones the machine keeps with `sudo pupitred migrate --status`.",
	},
	"migrate.status.revision": {
		FR: "configuration : révision %d, attendue %d (%s)",
		EN: "configuration: revision %d, expected %d (%s)",
	},
	"migrate.status.applied": {
		FR: "migrations appliquées :",
		EN: "migrations applied:",
	},
	"migrate.status.pending": {
		FR: "migrations en attente :",
		EN: "migrations owed:",
	},
	"migrate.status.none": {
		FR: "aucune",
		EN: "none",
	},
	"migrate.status.backups": {
		FR: "sauvegardes gardées :",
		EN: "backups kept:",
	},
	"migrate.done": {
		FR: "configuration migrée en révision %d.",
		EN: "configuration migrated to revision %d.",
	},
	"migrate.nothing": {
		FR: "configuration déjà en révision %d, rien à faire.",
		EN: "configuration already at revision %d, nothing to do.",
	},
	"migrate.failed": {
		FR: "migration %d (%s) refusée : %s",
		EN: "migration %d (%s) refused: %s",
	},
	"migrate.restored": {
		FR: "la configuration d'avant la migration a été remise en place depuis %s.",
		EN: "the configuration from before the migration was put back from %s.",
	},
	"migrate.restore.done": {
		FR: "sauvegarde %s restaurée : configuration en révision %d.",
		EN: "backup %s restored: configuration at revision %d.",
	},
	"migrate.argument.unknown": {
		FR: "argument inconnu : %s",
		EN: "unknown argument: %s",
	},
}
