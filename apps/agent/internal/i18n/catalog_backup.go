package i18n

// Backups: the module, the bucket's refusals, the restore, and what the terminal prints of them.
var backupCatalog = map[string]Message{
	"module.core.backup.name": {
		FR: "Sauvegardes",
		EN: "Backups",
	},
	"module.core.backup.summary": {
		FR: "Configuration, secrets, bases, projets et sessions du compte dev, chiffrés sur le serveur pour une clé que vous seul ouvrez, dans votre seau S3.",
		EN: "Configuration, secrets, databases, projects and the dev account's sessions, encrypted on the server for a key only you open, in your own S3 bucket.",
	},
	"module.core.backup.endpoint.label": {
		FR: "Point d'accès S3",
		EN: "S3 endpoint",
	},
	"module.core.backup.region.label": {
		FR: "Région",
		EN: "Region",
	},
	"module.core.backup.bucket.label": {
		FR: "Seau",
		EN: "Bucket",
	},
	"module.core.backup.prefix.label": {
		FR: "Préfixe",
		EN: "Prefix",
	},
	"module.core.backup.path_style.label": {
		FR: "Adressage par chemin",
		EN: "Path-style addressing",
	},
	"module.core.backup.access_key_id.label": {
		FR: "Clé d'accès",
		EN: "Access key",
	},
	"module.core.backup.secret_access_key.label": {
		FR: "Clé secrète",
		EN: "Secret key",
	},
	"module.core.backup.recipient.label": {
		FR: "Clé publique de chiffrement",
		EN: "Encryption public key",
	},
	"module.core.backup.kdf_salt.label": {
		FR: "Sel de la phrase de passe",
		EN: "Passphrase salt",
	},
	"module.core.backup.interval_hours.label": {
		FR: "Intervalle, en heures",
		EN: "Interval, in hours",
	},
	"module.core.backup.interval_hours.help": {
		FR: "0 : aucune sauvegarde planifiée, seulement à la demande.",
		EN: "0: no scheduled backup, only on demand.",
	},
	"module.core.backup.hour.label": {
		FR: "Heure de départ",
		EN: "Starting hour",
	},
	"module.core.backup.hour.help": {
		FR: "Heure du serveur où part une sauvegarde d'un jour ou plus.",
		EN: "The server's hour at which a backup of a day or more starts.",
	},
	"module.core.backup.keep.label": {
		FR: "Sauvegardes planifiées gardées",
		EN: "Scheduled backups kept",
	},
	"module.core.backup.keep.help": {
		FR: "Les plus anciennes au-delà sont effacées ; une sauvegarde manuelle ne l'est jamais.",
		EN: "Older ones beyond it are deleted; a manual backup never is.",
	},
	"module.core.backup.databases.label": {
		FR: "Bases de données",
		EN: "Databases",
	},
	"module.core.backup.home.label": {
		FR: "Clés et sessions du compte dev",
		EN: "Keys and sessions of the dev account",
	},
	"module.core.backup.home.help": {
		FR: "Clés SSH, identité git, sessions de gh et des agents de code : rien n'est à reconnecter après une restauration.",
		EN: "SSH keys, git identity, the sessions of gh and of the coding agents: nothing to sign in to again after a restore.",
	},
	"module.core.backup.projects.label": {
		FR: "Projets",
		EN: "Projects",
	},
	"module.core.backup.projects_env_only.label": {
		FR: "Seulement leurs fichiers d'environnement",
		EN: "Only their environment files",
	},
	"module.core.backup.projects_env_only.help": {
		FR: "Le code revient alors par un clone : les modifications non commitées et les commits non poussés ne reviennent pas. Un projet sans dépôt est toujours sauvegardé en entier.",
		EN: "The code then comes back through a clone: uncommitted changes and unpushed commits do not. A project without a repository is always backed up whole.",
	},
	"module.core.backup.extra_paths.label": {
		FR: "Dossiers en plus",
		EN: "Extra folders",
	},
	"module.core.backup.extra_paths.help": {
		FR: "Chemins relatifs à /home/dev.",
		EN: "Paths relative to /home/dev.",
	},
	"module.core.backup.exclude_projects.label": {
		FR: "Projets laissés hors des sauvegardes",
		EN: "Projects left out of the backups",
	},
	"module.core.backup.exclude_projects.help": {
		FR: "Tous les autres partent, ceux ajoutés plus tard compris.",
		EN: "Every other one goes, those added later included.",
	},
	"module.core.backup.exclude_databases.label": {
		FR: "Bases laissées hors des sauvegardes",
		EN: "Databases left out of the backups",
	},
	"module.core.backup.exclude_databases.help": {
		FR: "moteur:nom, ou redis:* pour l'instantané Redis. Toutes les autres partent, celles créées plus tard comprises.",
		EN: "engine:name, or redis:* for the Redis snapshot. Every other one goes, those created later included.",
	},
	"backup.name.invalid": {
		FR: "le nom d'une sauvegarde tient en %d caractères au plus, sans espace au début ni à la fin ni caractère de contrôle",
		EN: "a backup's name holds at most %d characters, with no space at either end and no control character",
	},
	"backup.excluded.cloned": {
		FR: "le projet %s était hors de la sauvegarde : son code revient par un clone, pas son travail en cours",
		EN: "the project %s was left out of the backup: its code comes back through a clone, not its work in progress",
	},
	"backup.excluded.dropped": {
		FR: "le projet %s était hors de la sauvegarde et n'a pas de dépôt : il quitte le registre, rien ne peut le ramener",
		EN: "the project %s was left out of the backup and has no repository: it leaves the registry, nothing can bring it back",
	},
	"backup.excluded.database": {
		FR: "la base %s était hors de la sauvegarde : elle n'est pas créée",
		EN: "the database %s was left out of the backup: it is not created",
	},

	"backup.storage.problem": {
		FR: "%s — %s",
		EN: "%s — %s",
	},
	"backup.storage.address": {
		FR: "le point d'accès %s n'est pas une adresse HTTPS, ou le seau ou la région ne sont pas des noms S3",
		EN: "the endpoint %s is not an HTTPS address, or the bucket or the region are not S3 names",
	},
	"backup.storage.unreachable": {
		FR: "le point d'accès S3 ne répond pas : %s",
		EN: "the S3 endpoint does not answer: %s",
	},
	"backup.storage.unreachable.fix": {
		FR: "Vérifiez l'adresse du point d'accès dans Réglages › Connexions › Sauvegardes, et que le serveur sort en HTTPS.",
		EN: "Check the endpoint address in Settings › Connections › Backups, and that the server can reach out over HTTPS.",
	},
	"backup.storage.bucket": {
		FR: "le seau n'existe pas sur ce point d'accès",
		EN: "the bucket does not exist on this endpoint",
	},
	"backup.storage.bucket.fix": {
		FR: "Créez le seau chez votre fournisseur, ou corrigez son nom dans Réglages › Connexions › Sauvegardes.",
		EN: "Create the bucket at your provider, or correct its name in Settings › Connections › Backups.",
	},
	"backup.storage.denied": {
		FR: "le seau refuse l'accès : %s",
		EN: "the bucket refuses access: %s",
	},
	"backup.storage.denied.fix": {
		FR: "Donnez à la clé d'accès la lecture, l'écriture et la suppression d'objets sur ce seau.",
		EN: "Give the access key read, write and delete rights on the objects of this bucket.",
	},
	"backup.storage.key": {
		FR: "le fournisseur ne connaît pas cette clé d'accès",
		EN: "the provider does not know this access key",
	},
	"backup.storage.key.fix": {
		FR: "Recopiez la clé d'accès depuis votre fournisseur dans Réglages › Connexions › Sauvegardes.",
		EN: "Copy the access key from your provider into Settings › Connections › Backups again.",
	},
	"backup.storage.secret": {
		FR: "la clé secrète ne correspond pas à la clé d'accès",
		EN: "the secret key does not match the access key",
	},
	"backup.storage.secret.fix": {
		FR: "Recopiez la clé secrète depuis votre fournisseur dans Réglages › Connexions › Sauvegardes.",
		EN: "Copy the secret key from your provider into Settings › Connections › Backups again.",
	},
	"backup.storage.skewed": {
		FR: "l'horloge du serveur est trop décalée pour que le seau accepte ses requêtes",
		EN: "the server's clock is too far off for the bucket to accept its requests",
	},
	"backup.storage.skewed.fix": {
		FR: "Remettez l'horloge à l'heure : sudo timedatectl set-ntp true.",
		EN: "Set the clock right: sudo timedatectl set-ntp true.",
	},
	"backup.storage.region": {
		FR: "le seau est dans une autre région (%s)",
		EN: "the bucket lives in another region (%s)",
	},
	"backup.storage.region.fix": {
		FR: "Donnez la région du seau, et le point d'accès de cette région, dans Réglages › Connexions › Sauvegardes.",
		EN: "Give the bucket's region, and that region's endpoint, in Settings › Connections › Backups.",
	},
	"backup.storage.other": {
		FR: "le seau refuse : %s",
		EN: "the bucket refuses: %s",
	},
	"backup.storage.other.fix": {
		FR: "Vérifiez le seau et ses droits chez votre fournisseur, puis recommencez.",
		EN: "Check the bucket and its rights at your provider, then try again.",
	},

	"backup.unconfigured": {
		FR: "les sauvegardes ne sont pas configurées sur ce serveur",
		EN: "backups are not configured on this server",
	},
	"backup.unconfigured.fix": {
		FR: "Connectez un seau dans Réglages › Connexions › Sauvegardes, puis installez core.backup sur ce serveur.",
		EN: "Connect a bucket in Settings › Connections › Backups, then install core.backup on this server.",
	},
	"backup.server_id.unknown": {
		FR: "la plateforme n'a pas encore nommé ce serveur : ses sauvegardes n'ont pas de dossier",
		EN: "the platform has not named this server yet: its backups have no folder",
	},
	"backup.server_id.unknown.fix": {
		FR: "Synchronisez le serveur avec la plateforme (platform.sync), puis recommencez.",
		EN: "Sync the server with the platform (platform.sync), then try again.",
	},
	"backup.part.failed": {
		FR: "%s : %s",
		EN: "%s: %s",
	},
	"backup.database.skipped": {
		FR: "%s : la base %s n'est pas sauvegardée, son nom ne passe pas sans risque sur une ligne de commande",
		EN: "%s: the database %s is not backed up, its name cannot travel safely on a command line",
	},
	"backup.project.missing": {
		FR: "le projet %s n'est pas sauvegardé : son dossier %s est absent",
		EN: "the project %s is not backed up: its folder %s is missing",
	},
	"backup.path.missing": {
		FR: "le dossier %s n'existe pas dans /home/dev",
		EN: "the folder %s does not exist in /home/dev",
	},
	"backup.path.refused": {
		FR: "le chemin %s sort de /home/dev ou n'en est pas un",
		EN: "the path %s leaves /home/dev or is not one",
	},

	"backup.location.invalid": {
		FR: "adresse de sauvegarde illisible : %s",
		EN: "unreadable backup address: %s",
	},
	"backup.location.invalid.fix": {
		FR: "Reprenez l'adresse d'une sauvegarde que la plateforme liste.",
		EN: "Take the address of a backup the platform lists.",
	},
	"backup.missing": {
		FR: "aucune sauvegarde sous %s : le manifeste est absent",
		EN: "no backup under %s: the manifest is missing",
	},
	"backup.missing.fix": {
		FR: "La sauvegarde a été effacée du seau ; choisissez-en une autre.",
		EN: "The backup was deleted from the bucket; choose another one.",
	},
	"backup.corrupt.manifest": {
		FR: "manifeste illisible : %s",
		EN: "unreadable manifest: %s",
	},
	"backup.corrupt.digest": {
		FR: "%s ne correspond pas à l'empreinte enregistrée : il a changé depuis la sauvegarde",
		EN: "%s does not match the recorded digest: it changed since the backup",
	},
	"backup.corrupt.absent": {
		FR: "%s manque dans le seau",
		EN: "%s is missing from the bucket",
	},
	"backup.corrupt.part": {
		FR: "%s ne s'ouvre pas : %s",
		EN: "%s does not open: %s",
	},
	"backup.corrupt.setup": {
		FR: "la sauvegarde ne porte pas de configuration",
		EN: "the backup carries no configuration",
	},
	"backup.corrupt.fix": {
		FR: "Choisissez une autre sauvegarde : celle-ci n'est plus celle qui a été enregistrée.",
		EN: "Choose another backup: this one is no longer the one that was recorded.",
	},
	"backup.unsupported.format": {
		FR: "format de sauvegarde %d inconnu de cet agent",
		EN: "backup format %d is unknown to this agent",
	},
	"backup.unsupported.revision": {
		FR: "la configuration sauvegardée est à la révision %d, cet agent lit la révision %d",
		EN: "the saved configuration is at revision %d, this agent reads revision %d",
	},
	"backup.unsupported.fix": {
		FR: "Mettez l'agent à jour, puis recommencez la restauration.",
		EN: "Update the agent, then restore again.",
	},
	"backup.key.missing": {
		FR: "la ligne de secrets ne porte pas de clé privée",
		EN: "the secret line carries no private key",
	},
	"backup.key.missing.fix": {
		FR: "Tapez la phrase de passe des sauvegardes : l'app en dérive la clé.",
		EN: "Type the backups' passphrase: the app derives the key from it.",
	},
	"backup.key.wrong": {
		FR: "cette clé n'ouvre pas cette sauvegarde",
		EN: "this key does not open this backup",
	},
	"backup.key.wrong.fix": {
		FR: "Tapez la phrase de passe en vigueur quand la sauvegarde a été faite.",
		EN: "Type the passphrase that was in use when the backup was made.",
	},
	"backup.secrets.fix": {
		FR: `Envoyez juste après la requête une ligne {"access_key_id":"…","secret_access_key":"…","private_key":"…"}.`,
		EN: `Send right after the request a line {"access_key_id":"…","secret_access_key":"…","private_key":"…"}.`,
	},
	"backup.part.unknown": {
		FR: "cette sauvegarde n'a pas de partie de données %s",
		EN: "this backup has no data part %s",
	},
	"backup.part.unknown.fix": {
		FR: "Nommez les parties que backup.restore.setup a rendues.",
		EN: "Name the parts backup.restore.setup answered.",
	},
	"backup.restore.installed": {
		FR: "ce serveur est déjà installé : une restauration remplacerait sa configuration",
		EN: "this server is already installed: a restore would replace its configuration",
	},
	"backup.restore.installed.fix": {
		FR: "Pour remettre ce serveur à la sauvegarde, passez par « Revenir à cette sauvegarde ».",
		EN: "To put this server back to the backup, use “Revert to this backup”.",
	},
	"backup.restore.stop": {
		FR: "les projets n'ont pas tous été arrêtés : %s",
		EN: "not every project was stopped: %s",
	},
	"backup.restore.migration": {
		FR: "la configuration restaurée ne se migre pas : la migration %d refuse (%s)",
		EN: "the restored configuration does not migrate: migration %d refuses (%s)",
	},
	"backup.restore.migration.pending": {
		FR: "la configuration restaurée attend encore une migration",
		EN: "the restored configuration still waits for a migration",
	},
	"backup.restore.migration.fix": {
		FR: "La configuration d'avant a été remise ; écrivez au support avec le journal /var/log/pupitre.log.",
		EN: "The previous configuration was put back; write to support with the journal /var/log/pupitre.log.",
	},
	"backup.restore.engine": {
		FR: "%s n'est pas installé : la base n'a nulle part où revenir",
		EN: "%s is not installed: the database has nowhere to go",
	},
	"backup.restore.engine.fix": {
		FR: "Installez %s, puis restaurez cette partie.",
		EN: "Install %s, then restore this part.",
	},
	"backup.restore.project": {
		FR: "le projet %s n'est pas dans le registre restauré",
		EN: "the project %s is not in the restored registry",
	},
	"backup.restore.project.fix": {
		FR: "Restaurez d'abord la configuration de cette sauvegarde (backup.restore.setup).",
		EN: "Restore this backup's configuration first (backup.restore.setup).",
	},

	"backup.redis.snapshot.timeout": {
		FR: "%s n'a pas fini son instantané en dix minutes",
		EN: "%s did not finish its snapshot within ten minutes",
	},
	"backup.redis.snapshot.failed": {
		FR: "%s n'a pas pu écrire son instantané : voyez journalctl -u redis-server",
		EN: "%s could not write its snapshot: see journalctl -u redis-server",
	},
	"backup.redis.rewrite.timeout": {
		FR: "%s n'a pas fini de réécrire son journal d'ajout en dix minutes",
		EN: "%s did not finish rewriting its append-only file within ten minutes",
	},
	"backup.mongodb.refused": {
		FR: "mongosh n'a pas fini son script : %s",
		EN: "mongosh did not finish its script: %s",
	},

	"devcli.backup.help": {
		FR: "une sauvegarde maintenant, ou où elles en sont",
		EN: "a backup now, or where backups stand",
	},
	"devcli.backup.expected": {
		FR: "dev backup attend now ou status",
		EN: "dev backup expects now or status",
	},
	"devcli.backup.copied": {
		FR: "inchangé",
		EN: "unchanged",
	},
	"devcli.backup.manual": {
		FR: "à la demande seulement, %d gardée(s)",
		EN: "on demand only, %d kept",
	},
	"devcli.backup.made": {
		FR: "sauvegarde %s : %d partie(s), %s Mo",
		EN: "backup %s: %d part(s), %s MB",
	},
	"devcli.backup.undeclared": {
		FR: "la plateforme n'a pas répondu : le démon la déclarera à son prochain tour",
		EN: "the platform did not answer: the daemon will declare it at its next turn",
	},
	"devcli.backup.unconfigured": {
		FR: "les sauvegardes ne sont pas configurées sur ce serveur",
		EN: "backups are not configured on this server",
	},
	"devcli.backup.schedule": {
		FR: "toutes les %d h, %d gardée(s)",
		EN: "every %d h, %d kept",
	},
	"devcli.backup.next": {
		FR: "prochaine : %s",
		EN: "next: %s",
	},
	"devcli.backup.running": {
		FR: "une sauvegarde est en cours",
		EN: "a backup is running",
	},
	"devcli.backup.never": {
		FR: "aucune sauvegarde encore",
		EN: "no backup yet",
	},
	"devcli.backup.last.ok": {
		FR: "dernière : %s · %s · %s Mo",
		EN: "last: %s · %s · %s MB",
	},
	"devcli.backup.last.failed": {
		FR: "dernière : %s · échec : %s",
		EN: "last: %s · failed: %s",
	},

	"cli.backup.usage": {
		FR: "usage : pupitred backup open --salt=<sel> FICHIER (la phrase de passe sur l'entrée standard), ou pupitred backup open --private-key FICHIER (la clé sur l'entrée standard)",
		EN: "usage: pupitred backup open --salt=<salt> FILE (the passphrase on standard input), or pupitred backup open --private-key FILE (the key on standard input)",
	},
	"cli.backup.failed": {
		FR: "%s ne s'ouvre pas : %s",
		EN: "%s does not open: %s",
	},
	"cli.backup.wrong": {
		FR: "la phrase ou la clé n'ouvre pas ce fichier, ou il a été modifié ou coupé",
		EN: "the passphrase or the key does not open this file, or it was altered or cut",
	},
	"cli.backup.decomposed": {
		FR: "la phrase porte une marque combinante que cet outil ne sait pas composer : tapez-la avec des caractères précomposés, telle que l'app l'affiche, ou passez la clé avec --private-key",
		EN: "the passphrase holds a combining mark this tool cannot compose: type it with precomposed characters, as the app shows it, or pass the key with --private-key",
	},
	"cli.backup.foreign": {
		FR: "ce fichier n'est pas une partie de sauvegarde Pupitre",
		EN: "this file is not a Pupitre backup part",
	},
	"cli.backup.key": {
		FR: "une clé privée fait 32 octets, en base64",
		EN: "a private key is 32 bytes, in base64",
	},
}
