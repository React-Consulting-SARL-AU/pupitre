export const backups = {
  en: {
    "backups.title": "Backups",
    "backups.tabs": "Backup panes",
    "backups.tab.overview": "Dashboard",
    "backups.tab.frequency": "Frequency",
    "backups.tab.content": "Content",
    "backups.tab.destination": "Destination",

    "backups.status.title": "State",
    "backups.status.running": "A backup of this server is running.",
    "backups.status.last": "Last backup",
    "backups.status.lastOk": "{date} · {weight}",
    "backups.status.lastFailed": "Failed on {date}",
    "backups.status.never": "None yet",
    "backups.status.next": "Next backup",
    "backups.status.onDemand": "Only when asked",
    "backups.status.every": "Frequency",
    "backups.status.hours.one": "Every hour",
    "backups.status.hours.other": "Every {count} hours",
    "backups.status.keep.one": "The last scheduled backup is kept",
    "backups.status.keep.other": "The last {count} scheduled backups are kept",
    "backups.status.docker":
      "Docker volumes are not in the backups: keep what they hold elsewhere.",
    "backups.status.incomplete.one":
      "The last backup is incomplete: one part could not be backed up, and would not come back with a restore.",
    "backups.status.incomplete.other":
      "The last backup is incomplete: {count} parts could not be backed up, and would not come back with a restore.",

    "backups.run.now": "Back up now",
    "backups.label.dated": "of {date}",
    "backups.label.named": "“{name}” of {date}",
    "backups.name.title": "Back up now",
    "backups.name.label": "Name of the backup",
    "backups.name.help":
      "Optional: shown beside its date, to find it again. Left empty, the date is enough.",
    "backups.name.placeholder": "Before the migration",
    "backups.name.problem":
      "At most {max} characters, with no space at either end and no control character.",
    "backups.name.confirm": "Back up",
    "backups.run.title": "Backup now",
    "backups.run.running": "Backing the server up to the bucket",
    "backups.run.done": "Backup done: {weight} in the bucket.",
    "backups.run.undeclared":
      "The platform did not answer: the server lists this backup at its next turn.",
    "backups.run.dismiss": "Close",

    "backups.list.title": "Backups of this server",
    "backups.list.empty": "No backup of this server yet",
    "backups.trigger.manual": "asked for",
    "backups.trigger.schedule": "scheduled",
    "backups.counts.databases.one": "{count} database",
    "backups.counts.databases.other": "{count} databases",
    "backups.counts.projects.one": "{count} project",
    "backups.counts.projects.other": "{count} projects",
    "backups.counts.paths.one": "{count} folder",
    "backups.counts.paths.other": "{count} folders",
    "backups.counts.home": "dev account keys and sessions",
    "backups.counts.setupOnly": "configuration only",

    "backups.remove.label": "Delete",
    "backups.remove.confirm": "Delete the backup",
    "backups.remove.question":
      "The backup {backup} is erased from the bucket. Nobody can go back to it afterwards.",

    "backups.revert.open": "Go back to this backup",
    "backups.revert.title": "Go back to the backup {backup}",
    "backups.revert.consequence":
      "The server's projects stop, and its configuration and data are replaced by the backup's. Projects the backup does not know leave the list; their folders stay.",
    "backups.revert.saveFirst": "Back up the current state first",
    "backups.revert.saveFirstDetail":
      "Lets you come back to the server as it is now.",
    "backups.revert.passphraseHelp":
      "Checked on this computer before anything is sent to the server.",
    "backups.revert.confirm": "Go back to this backup",
    "backups.revert.progressTitle": "Going back to the backup {backup}",
    "backups.revert.phase.verify": "Checking the passphrase",
    "backups.revert.phase.save": "Backing up the current state",
    "backups.revert.phase.setup": "Putting the backup's configuration in place",
    "backups.revert.phase.install": "Installing the backup's services",
    "backups.revert.phase.extra":
      "Uninstalling the services the backup does not hold",
    "backups.revert.phase.data":
      "Bringing the data back and starting the projects",
    "backups.revert.stoppedAt": "Stopped at: {phase}",
    "backups.revert.done": "The server is back to the backup {backup}.",
    "backups.revert.dismiss": "Close",

    "backups.extra.question":
      "The server runs services the backup does not hold. The ticked ones are uninstalled before the data comes back.",
    "backups.extra.settle.one": "Uninstall {count} service and go on",
    "backups.extra.settle.other": "Uninstall {count} services and go on",

    "backups.result.restored": "Parts restored",
    "backups.result.failed": "Parts failed",
    "backups.result.started": "Projects started",

    "backups.part.setup": "Configuration",
    "backups.part.home": "dev account keys and sessions",
    "backups.part.database": "Database {database}",
    "backups.database.whole.postgres": "roles",
    "backups.database.whole.mysql": "accounts",
    "backups.database.whole.mongodb": "whole server",
    "backups.database.whole.redis": "snapshot",

    "backups.setup.title": "Set up backups",
    "backups.setup.progress": "Setup steps",
    "backups.setup.step.bucket": "S3 bucket",
    "backups.setup.step.passphrase": "Passphrase",
    "backups.setup.step.frequency": "Frequency",
    "backups.setup.step.content": "Content",
    "backups.setup.back": "Back",
    "backups.setup.next": "Continue",
    "backups.setup.activate": "Turn on backups",
    "backups.setup.runFirst": "Run a first backup as soon as they are on",
    "backups.setup.bucket.lead":
      "Backups go into your own bucket: Pupitre keeps none of them.",
    "backups.setup.bucket.held":
      "This computer already sends its servers' backups to this bucket.",
    "backups.setup.bucket.other": "Use another bucket",
    "backups.setup.bucket.keep": "Keep this bucket",
    "backups.setup.passphrase.held":
      "Backups are encrypted for the key with fingerprint {fingerprint}, already chosen on this computer. Its passphrase is only asked to restore.",

    "backups.provider.label": "Provider",
    "backups.provider.r2.title": "Cloudflare R2",
    "backups.provider.r2.detail":
      "No egress fees: downloading a backup to restore it costs nothing.",
    "backups.provider.aws.title": "Amazon S3",
    "backups.provider.aws.detail": "The endpoint follows the bucket's region.",
    "backups.provider.other.title": "Another S3 service",
    "backups.provider.other.detail":
      "Backblaze B2, Scaleway, Wasabi, MinIO…: any S3-compatible endpoint over HTTPS.",
    "backups.field.r2Account": "Cloudflare account ID",
    "backups.field.r2AccountHelp":
      "Shown on the R2 overview, or in the S3 API address https://<account ID>.r2.cloudflarestorage.com, which can be pasted whole.",
    "backups.field.awsRegionHelp":
      "As the S3 console shows it next to the bucket, for example eu-west-3.",
    "backups.field.problem.r2Account":
      "32 characters, digits and the letters a to f.",

    "backups.frequency.every": "Frequency",
    "backups.frequency.choice.1": "Every hour",
    "backups.frequency.choice.6": "Every 6 hours",
    "backups.frequency.choice.12": "Every 12 hours",
    "backups.frequency.choice.24": "Every day",
    "backups.frequency.choice.168": "Every week",
    "backups.frequency.choice.0": "On demand only",
    "backups.frequency.choice.custom": "Another interval",
    "backups.frequency.hours": "Interval, in hours",
    "backups.frequency.hour": "Starting time",
    "backups.frequency.hourHelp": "In the server's time zone.",
    "backups.frequency.keep": "Backups kept",
    "backups.frequency.keepHelp":
      "About {history} of history in the bucket. Older scheduled backups are deleted; a manual one never is.",
    "backups.frequency.span.hours.one": "{count} hour",
    "backups.frequency.span.hours.other": "{count} hours",
    "backups.frequency.span.days.one": "{count} day",
    "backups.frequency.span.days.other": "{count} days",
    "backups.frequency.span.weeks.one": "{count} week",
    "backups.frequency.span.weeks.other": "{count} weeks",
    "backups.frequency.manual":
      "Only “Back up now” starts a backup, and none is ever deleted.",

    "backups.destination.title": "Destination",
    "backups.destination.drift":
      "This server does not back up to this computer's bucket and key yet: apply the settings to align it.",

    "backups.schedule.title": "Frequency and retention",
    "backups.contents.title": "What backups carry",
    "backups.contents.databasesDetail":
      "A database created later is carried too, unless it is unticked here.",
    "backups.contents.projectsDetail":
      "A project added later is carried too, unless it is unticked here.",
    "backups.contents.noRepo": "No repository: always carried whole.",
    "backups.contents.gone":
      "No longer on this server; stays left out if it comes back.",
    "backups.contents.unreadable":
      "{engines} did not answer: its databases cannot be listed here for now.",
    "backups.contents.reading": "Reading the server's projects and databases",
    "backups.part.project": "Project {name}",
    "backups.part.path": "Folder ~/{path}",

    "backups.connection.save": "Save the connection",
    "backups.connection.cancel": "Keep the connection as it was",
    "backups.connection.edit": "Edit the connection",
    "backups.connection.fingerprint": "Backup key fingerprint",
    "backups.connection.fingerprintDetail":
      "The same on every computer of the organization.",
    "backups.connection.forgetQuestion":
      "The servers keep backing up with what they hold. This computer can no longer set up backups or restore one until it is connected again.",

    "backups.field.endpoint": "S3 endpoint",
    "backups.field.endpointHelp":
      "Cloudflare R2: https://<account id>.r2.cloudflarestorage.com, shown on the R2 overview page. AWS: https://s3.<region>.amazonaws.com.",
    "backups.guide": "Create an R2 bucket and its key",
    "backups.guideUrl": "https://pupitre.studio/docs/daily/backups/",
    "backups.advanced": "Advanced settings",
    "backups.field.region": "Region",
    "backups.field.bucket": "Bucket",
    "backups.field.prefix": "Prefix",
    "backups.field.prefixHelp":
      "The folder of the bucket backups go under, without a slash at the end.",
    "backups.field.accessKeyId": "Access key ID",
    "backups.field.secretKept":
      "Leave empty to keep the secret key in this computer's keychain.",
    "backups.field.pathStyle": "Path-style addressing",
    "backups.field.pathStyleDetail":
      "Turn off for a provider that requires virtual-hosted addressing.",
    "backups.field.problem.required": "Required.",
    "backups.field.problem.http":
      "An https:// address, for example https://<account id>.r2.cloudflarestorage.com: over http, the request signatures would cross in clear.",
    "backups.field.problem.endpoint":
      "An https:// address, for example https://<account id>.r2.cloudflarestorage.com.",
    "backups.field.problem.bucket":
      "3 to 63 characters: lowercase letters, digits, dots and hyphens, starting and ending with a letter or a digit.",
    "backups.field.problem.region":
      "auto for Cloudflare R2, or the bucket's region at AWS, such as eu-west-3: lowercase letters, digits and hyphens.",
    "backups.field.problem.prefix":
      "Letters, digits, dots, hyphens and underscores, in folders separated by slashes, with no slash at either end.",

    "backups.passphrase.label": "Backup passphrase",
    "backups.passphrase.confirm": "Passphrase again",
    "backups.passphrase.help":
      "At least {min} characters. Asked again only to restore.",
    "backups.passphrase.short": "At least {min} characters.",
    "backups.passphrase.mismatch": "The two passphrases differ.",
    "backups.passphrase.lost":
      "A lost passphrase makes every backup unreadable: nobody, Pupitre included, can recover it.",
    "backups.passphrase.draw": "Draw a passphrase",
    "backups.passphrase.drawn": "Drawn passphrase",
    "backups.passphrase.drawnHelp":
      "Write it down somewhere safe before saving: it is not shown again.",
    "backups.passphrase.noted":
      "I wrote this passphrase down somewhere other than this computer",
    "backups.passphrase.notedMissing":
      "Tick this once the passphrase is written down: without it, no backup can be restored.",
    "backups.passphrase.adopted":
      "Your organization already has backups (the latest from {server}, {date}): this computer takes their public key. The passphrase will be asked only to restore.",
    "backups.passphrase.own": "Choose a new passphrase",
    "backups.passphrase.renew": "Change the passphrase",
    "backups.passphrase.renewDetail":
      "Backups made from now on use the new one; the earlier ones still open with the old one.",

    "refusal.backup.field": "The bucket's {field} is not valid.",
    "refusal.backup.field.fix": "Correct the field, then save again.",
    "refusal.backup.secret.none": "The secret access key is missing.",
    "refusal.backup.secret.none.fix":
      "Paste the secret key given with the access key ID.",
    "refusal.backup.passphrase.short": "The passphrase is too short.",
    "refusal.backup.passphrase.short.fix": "Type at least {min} characters.",
    "refusal.backup.passphrase.none":
      "Your organization has no backup yet: a passphrase has to be chosen.",
    "refusal.backup.passphrase.none.fix":
      "Type a passphrase twice, or draw one, then save.",
    "refusal.backup.passphrase.wrong":
      "This passphrase does not open this backup.",
    "refusal.backup.passphrase.wrong.fix":
      "Type the passphrase that was chosen when the backup was made. Nothing was sent to the server.",
    "refusal.backup.passphrase.needed":
      "This run of the app no longer holds the backup's key.",
    "refusal.backup.passphrase.needed.fix":
      "Type the backup passphrase again to bring the data back.",
    "refusal.backup.unknown": "The platform does not list the backup {id}.",
    "refusal.backup.unknown.fix":
      "Reload the list of backups: it may have been deleted in the meantime.",
    "refusal.backup.unenrolled":
      "This server is not enrolled with the platform: it has no backups listed.",
    "refusal.backup.unenrolled.fix":
      "Open the server once so its agent answers, then reload the page.",
    "refusal.backup.parts.none": "No part of the backup was chosen.",
    "refusal.backup.parts.none.fix": "Tick at least one part to bring back.",
    "refusal.backup.install.failed":
      "Some services did not install: {modules}.",
    "refusal.backup.install.failed.fix":
      "Their rows say what failed and the command that repairs them; the data waits until they run.",
    "refusal.backup.probe.bucket": "There is no such bucket at this endpoint.",
    "refusal.backup.probe.bucket.fix":
      "Check the bucket's name and the endpoint. On R2, a bucket is created in R2 › Create bucket.",
    "refusal.backup.probe.denied":
      "This key may not write in this bucket, or no bucket has this name.",
    "refusal.backup.probe.denied.fix":
      "Check the bucket's name: a key limited to one bucket answers the same way for a name it does not open. Then give the key Object Read & Write on this bucket (R2 › Manage API tokens), and save again.",
    "refusal.backup.probe.delete":
      "This key writes in the bucket but may not delete from it.",
    "refusal.backup.probe.delete.fix":
      "Old backups are deleted with the same key: give it the right to delete objects, then save again.",
    "refusal.backup.probe.keyId":
      "The provider knows no access key with this ID.",
    "refusal.backup.probe.keyId.fix":
      "Copy the access key ID again, exactly as the dashboard shows it.",
    "refusal.backup.probe.secret":
      "The secret key does not match this access key ID.",
    "refusal.backup.probe.secret.fix":
      "Paste the secret key again: it is shown only once, when the key is created. Otherwise create a new key.",
    "refusal.backup.probe.clock":
      "This computer's clock is too far off for the provider.",
    "refusal.backup.probe.clock.fix":
      "Set the date and time automatically in the system settings, then save again.",
    "refusal.backup.probe.unreachable": "{endpoint} does not answer: {reason}.",
    "refusal.backup.probe.unreachable.fix":
      "Check the endpoint and this computer's connection, then save again.",
    "refusal.backup.probe.refused":
      "The bucket refused the test write ({code}).",
    "refusal.backup.probe.refused.fix":
      "Check the bucket, the key and its rights, then save again.",
  },
  fr: {
    "backups.title": "Sauvegardes",
    "backups.tabs": "Volets des sauvegardes",
    "backups.tab.overview": "Tableau de bord",
    "backups.tab.frequency": "Fréquence",
    "backups.tab.content": "Contenu",
    "backups.tab.destination": "Destination",

    "backups.status.title": "État",
    "backups.status.running": "Une sauvegarde de ce serveur est en cours.",
    "backups.status.last": "Dernière sauvegarde",
    "backups.status.lastOk": "{date} · {weight}",
    "backups.status.lastFailed": "Échec le {date}",
    "backups.status.never": "Aucune pour l'instant",
    "backups.status.next": "Prochaine sauvegarde",
    "backups.status.onDemand": "Seulement à la demande",
    "backups.status.every": "Fréquence",
    "backups.status.hours.one": "Toutes les heures",
    "backups.status.hours.other": "Toutes les {count} heures",
    "backups.status.keep.one": "La dernière sauvegarde planifiée est gardée",
    "backups.status.keep.other":
      "Les {count} dernières sauvegardes planifiées sont gardées",
    "backups.status.docker":
      "Les volumes Docker ne sont pas dans les sauvegardes : gardez ce qu'ils contiennent ailleurs.",
    "backups.status.incomplete.one":
      "La dernière sauvegarde est incomplète : une partie n'a pas pu être sauvegardée, et ne reviendrait pas avec une restauration.",
    "backups.status.incomplete.other":
      "La dernière sauvegarde est incomplète : {count} parties n'ont pas pu être sauvegardées, et ne reviendraient pas avec une restauration.",

    "backups.run.now": "Sauvegarder maintenant",
    "backups.label.dated": "du {date}",
    "backups.label.named": "« {name} » du {date}",
    "backups.name.title": "Sauvegarder maintenant",
    "backups.name.label": "Nom de la sauvegarde",
    "backups.name.help":
      "Facultatif : affiché à côté de sa date, pour la retrouver. Laissé vide, la date suffit.",
    "backups.name.placeholder": "Avant la migration",
    "backups.name.problem":
      "Au plus {max} caractères, sans espace au début ni à la fin ni caractère de contrôle.",
    "backups.name.confirm": "Sauvegarder",
    "backups.run.title": "Sauvegarde immédiate",
    "backups.run.running": "Sauvegarde du serveur vers le seau",
    "backups.run.done": "Sauvegarde terminée : {weight} dans le seau.",
    "backups.run.undeclared":
      "La plateforme n'a pas répondu : le serveur déclarera cette sauvegarde au tour suivant.",
    "backups.run.dismiss": "Fermer",

    "backups.list.title": "Sauvegardes de ce serveur",
    "backups.list.empty": "Aucune sauvegarde de ce serveur pour l'instant",
    "backups.trigger.manual": "demandée",
    "backups.trigger.schedule": "planifiée",
    "backups.counts.databases.one": "{count} base",
    "backups.counts.databases.other": "{count} bases",
    "backups.counts.projects.one": "{count} projet",
    "backups.counts.projects.other": "{count} projets",
    "backups.counts.paths.one": "{count} dossier",
    "backups.counts.paths.other": "{count} dossiers",
    "backups.counts.home": "clés et sessions du compte dev",
    "backups.counts.setupOnly": "configuration seule",

    "backups.remove.label": "Supprimer",
    "backups.remove.confirm": "Supprimer la sauvegarde",
    "backups.remove.question":
      "La sauvegarde {backup} est effacée du seau. Personne ne pourra plus y revenir.",

    "backups.revert.open": "Revenir à cette sauvegarde",
    "backups.revert.title": "Revenir à la sauvegarde {backup}",
    "backups.revert.consequence":
      "Les projets du serveur s'arrêtent, sa configuration et ses données sont remplacées par celles de la sauvegarde. Les projets que la sauvegarde ne connaît pas quittent la liste ; leurs dossiers restent.",
    "backups.revert.saveFirst": "Sauvegarder l'état actuel d'abord",
    "backups.revert.saveFirstDetail":
      "Permet de revenir au serveur tel qu'il est maintenant.",
    "backups.revert.passphraseHelp":
      "Vérifiée sur cet ordinateur avant que rien ne parte vers le serveur.",
    "backups.revert.confirm": "Revenir à cette sauvegarde",
    "backups.revert.progressTitle": "Retour à la sauvegarde {backup}",
    "backups.revert.phase.verify": "Vérification de la phrase de passe",
    "backups.revert.phase.save": "Sauvegarde de l'état actuel",
    "backups.revert.phase.setup": "Pose de la configuration de la sauvegarde",
    "backups.revert.phase.install":
      "Installation des services de la sauvegarde",
    "backups.revert.phase.extra":
      "Désinstallation des services absents de la sauvegarde",
    "backups.revert.phase.data": "Retour des données et démarrage des projets",
    "backups.revert.stoppedAt": "Arrêté à l'étape : {phase}",
    "backups.revert.done": "Le serveur est revenu à la sauvegarde {backup}.",
    "backups.revert.dismiss": "Fermer",

    "backups.extra.question":
      "Le serveur fait tourner des services que la sauvegarde ne contient pas. Ceux qui sont cochés sont désinstallés avant le retour des données.",
    "backups.extra.settle.one": "Désinstaller {count} service et continuer",
    "backups.extra.settle.other": "Désinstaller {count} services et continuer",

    "backups.result.restored": "Parties restaurées",
    "backups.result.failed": "Parties en échec",
    "backups.result.started": "Projets démarrés",

    "backups.part.setup": "Configuration",
    "backups.part.home": "Clés et sessions du compte dev",
    "backups.part.database": "Base {database}",
    "backups.database.whole.postgres": "rôles",
    "backups.database.whole.mysql": "comptes",
    "backups.database.whole.mongodb": "serveur entier",
    "backups.database.whole.redis": "instantané",

    "backups.setup.title": "Mettre en place les sauvegardes",
    "backups.setup.progress": "Étapes de la mise en place",
    "backups.setup.step.bucket": "Seau S3",
    "backups.setup.step.passphrase": "Phrase de passe",
    "backups.setup.step.frequency": "Fréquence",
    "backups.setup.step.content": "Contenu",
    "backups.setup.back": "Retour",
    "backups.setup.next": "Continuer",
    "backups.setup.activate": "Activer les sauvegardes",
    "backups.setup.runFirst": "Lancer une première sauvegarde dès l'activation",
    "backups.setup.bucket.lead":
      "Les sauvegardes partent dans votre propre seau : Pupitre n'en garde aucune.",
    "backups.setup.bucket.held":
      "Cet ordinateur envoie déjà les sauvegardes de ses serveurs vers ce seau.",
    "backups.setup.bucket.other": "Utiliser un autre seau",
    "backups.setup.bucket.keep": "Garder ce seau",
    "backups.setup.passphrase.held":
      "Les sauvegardes sont chiffrées pour la clé d'empreinte {fingerprint}, déjà choisie sur cet ordinateur. Sa phrase de passe n'est demandée que pour restaurer.",

    "backups.provider.label": "Fournisseur",
    "backups.provider.r2.title": "Cloudflare R2",
    "backups.provider.r2.detail":
      "Sans frais de sortie : télécharger une sauvegarde pour la restaurer ne coûte rien.",
    "backups.provider.aws.title": "Amazon S3",
    "backups.provider.aws.detail": "Le point d'accès suit la région du seau.",
    "backups.provider.other.title": "Autre service S3",
    "backups.provider.other.detail":
      "Backblaze B2, Scaleway, Wasabi, MinIO… : tout point d'accès compatible S3 en HTTPS.",
    "backups.field.r2Account": "Identifiant du compte Cloudflare",
    "backups.field.r2AccountHelp":
      "Affiché sur la page d'accueil de R2, ou dans l'adresse de l'API S3 https://<identifiant>.r2.cloudflarestorage.com, qui peut être collée entière.",
    "backups.field.awsRegionHelp":
      "Telle que la console S3 l'affiche à côté du seau, par exemple eu-west-3.",
    "backups.field.problem.r2Account":
      "32 caractères : des chiffres et les lettres de a à f.",

    "backups.frequency.every": "Fréquence",
    "backups.frequency.choice.1": "Toutes les heures",
    "backups.frequency.choice.6": "Toutes les 6 heures",
    "backups.frequency.choice.12": "Toutes les 12 heures",
    "backups.frequency.choice.24": "Chaque jour",
    "backups.frequency.choice.168": "Chaque semaine",
    "backups.frequency.choice.0": "À la demande seulement",
    "backups.frequency.choice.custom": "Un autre intervalle",
    "backups.frequency.hours": "Intervalle, en heures",
    "backups.frequency.hour": "Heure de départ",
    "backups.frequency.hourHelp": "À l'heure du serveur.",
    "backups.frequency.keep": "Sauvegardes gardées",
    "backups.frequency.keepHelp":
      "Environ {history} d'historique dans le seau. Les sauvegardes planifiées plus anciennes sont effacées ; une sauvegarde manuelle ne l'est jamais.",
    "backups.frequency.span.hours.one": "{count} heure",
    "backups.frequency.span.hours.other": "{count} heures",
    "backups.frequency.span.days.one": "{count} jour",
    "backups.frequency.span.days.other": "{count} jours",
    "backups.frequency.span.weeks.one": "{count} semaine",
    "backups.frequency.span.weeks.other": "{count} semaines",
    "backups.frequency.manual":
      "Seul « Sauvegarder maintenant » lance une sauvegarde, et aucune n'est jamais effacée.",

    "backups.destination.title": "Destination",
    "backups.destination.drift":
      "Ce serveur ne sauvegarde pas encore vers le seau et pour la clé de cet ordinateur : appliquez les réglages pour l'y aligner.",

    "backups.schedule.title": "Fréquence et rétention",
    "backups.contents.title": "Contenu des sauvegardes",
    "backups.contents.databasesDetail":
      "Une base créée plus tard part aussi, tant qu'elle n'est pas décochée ici.",
    "backups.contents.projectsDetail":
      "Un projet ajouté plus tard part aussi, tant qu'il n'est pas décoché ici.",
    "backups.contents.noRepo": "Sans dépôt : toujours sauvegardé en entier.",
    "backups.contents.gone":
      "N'est plus sur ce serveur ; reste exclu s'il revient.",
    "backups.contents.unreadable":
      "{engines} n'a pas répondu : ses bases ne peuvent pas être listées ici pour l'instant.",
    "backups.contents.reading": "Lecture des projets et des bases du serveur",
    "backups.part.project": "Projet {name}",
    "backups.part.path": "Dossier ~/{path}",

    "backups.connection.save": "Enregistrer la connexion",
    "backups.connection.cancel": "Garder la connexion telle quelle",
    "backups.connection.edit": "Modifier la connexion",
    "backups.connection.fingerprint": "Empreinte de la clé des sauvegardes",
    "backups.connection.fingerprintDetail":
      "La même sur chaque ordinateur de l'organisation.",
    "backups.connection.forgetQuestion":
      "Les serveurs continuent de sauvegarder avec ce qu'ils détiennent. Cet ordinateur ne pourra plus mettre en place de sauvegardes ni en restaurer une avant d'être reconnecté.",

    "backups.field.endpoint": "Point d'accès S3",
    "backups.field.endpointHelp":
      "Cloudflare R2 : https://<identifiant du compte>.r2.cloudflarestorage.com, affiché sur la page d'accueil de R2. AWS : https://s3.<région>.amazonaws.com.",
    "backups.guide": "Créer un seau R2 et sa clé",
    "backups.guideUrl": "https://pupitre.studio/fr/docs/daily/backups/",
    "backups.advanced": "Réglages avancés",
    "backups.field.region": "Région",
    "backups.field.bucket": "Seau",
    "backups.field.prefix": "Préfixe",
    "backups.field.prefixHelp":
      "Le dossier du seau sous lequel partent les sauvegardes, sans barre oblique au bout.",
    "backups.field.accessKeyId": "Identifiant de la clé d'accès",
    "backups.field.secretKept":
      "Laissez vide pour garder la clé secrète du trousseau de cet ordinateur.",
    "backups.field.pathStyle": "Adressage par chemin",
    "backups.field.pathStyleDetail":
      "À désactiver pour un fournisseur qui exige l'adressage virtuel.",
    "backups.field.problem.required": "Obligatoire.",
    "backups.field.problem.http":
      "Une adresse en https://, par exemple https://<identifiant du compte>.r2.cloudflarestorage.com : en http, les signatures des requêtes passeraient en clair.",
    "backups.field.problem.endpoint":
      "Une adresse en https://, par exemple https://<identifiant du compte>.r2.cloudflarestorage.com.",
    "backups.field.problem.bucket":
      "De 3 à 63 caractères : minuscules, chiffres, points et tirets, commençant et finissant par une lettre ou un chiffre.",
    "backups.field.problem.region":
      "auto pour Cloudflare R2, ou la région du seau chez AWS, par exemple eu-west-3 : minuscules, chiffres et tirets.",
    "backups.field.problem.prefix":
      "Lettres, chiffres, points, tirets et soulignés, en dossiers séparés par des barres obliques, sans barre au début ni à la fin.",

    "backups.passphrase.label": "Phrase de passe des sauvegardes",
    "backups.passphrase.confirm": "Phrase de passe, une seconde fois",
    "backups.passphrase.help":
      "Au moins {min} caractères. Redemandée seulement pour restaurer.",
    "backups.passphrase.short": "Au moins {min} caractères.",
    "backups.passphrase.mismatch": "Les deux phrases diffèrent.",
    "backups.passphrase.lost":
      "Perdue, la phrase de passe rend toutes les sauvegardes illisibles : personne, Pupitre compris, ne peut la retrouver.",
    "backups.passphrase.draw": "Tirer une phrase de passe",
    "backups.passphrase.drawn": "Phrase de passe tirée",
    "backups.passphrase.drawnHelp":
      "Notez-la en lieu sûr avant d'enregistrer : elle n'est plus jamais affichée.",
    "backups.passphrase.noted":
      "J'ai noté cette phrase ailleurs que sur cet ordinateur",
    "backups.passphrase.notedMissing":
      "Cochez cette case une fois la phrase notée : sans elle, aucune sauvegarde ne se restaure.",
    "backups.passphrase.adopted":
      "Votre organisation a déjà des sauvegardes (la dernière de {server}, le {date}) : cet ordinateur reprend leur clé publique. La phrase de passe ne sera demandée que pour restaurer.",
    "backups.passphrase.own": "Choisir une nouvelle phrase de passe",
    "backups.passphrase.renew": "Changer la phrase de passe",
    "backups.passphrase.renewDetail":
      "Les sauvegardes suivantes emploient la nouvelle ; les précédentes s'ouvrent toujours avec l'ancienne.",

    "refusal.backup.field": "Le champ {field} du seau n'est pas valide.",
    "refusal.backup.field.fix":
      "Corrigez le champ, puis enregistrez à nouveau.",
    "refusal.backup.secret.none": "La clé d'accès secrète manque.",
    "refusal.backup.secret.none.fix":
      "Collez la clé secrète fournie avec l'identifiant de la clé d'accès.",
    "refusal.backup.passphrase.short": "La phrase de passe est trop courte.",
    "refusal.backup.passphrase.short.fix": "Tapez au moins {min} caractères.",
    "refusal.backup.passphrase.none":
      "Votre organisation n'a pas encore de sauvegarde : une phrase de passe doit être choisie.",
    "refusal.backup.passphrase.none.fix":
      "Tapez une phrase de passe deux fois, ou tirez-en une, puis enregistrez.",
    "refusal.backup.passphrase.wrong":
      "Cette phrase de passe n'ouvre pas cette sauvegarde.",
    "refusal.backup.passphrase.wrong.fix":
      "Tapez la phrase choisie quand la sauvegarde a été faite. Rien n'a été envoyé au serveur.",
    "refusal.backup.passphrase.needed":
      "Ce lancement de l'app ne tient plus la clé de la sauvegarde.",
    "refusal.backup.passphrase.needed.fix":
      "Tapez à nouveau la phrase de passe des sauvegardes pour ramener les données.",
    "refusal.backup.unknown": "La plateforme ne liste pas la sauvegarde {id}.",
    "refusal.backup.unknown.fix":
      "Rechargez la liste des sauvegardes : elle a peut-être été supprimée entre-temps.",
    "refusal.backup.unenrolled":
      "Ce serveur n'est pas enrôlé auprès de la plateforme : aucune sauvegarde ne lui est listée.",
    "refusal.backup.unenrolled.fix":
      "Ouvrez le serveur une fois pour que son agent réponde, puis rechargez la page.",
    "refusal.backup.parts.none": "Aucune partie de la sauvegarde n'est cochée.",
    "refusal.backup.parts.none.fix": "Cochez au moins une partie à ramener.",
    "refusal.backup.install.failed":
      "Des services ne se sont pas installés : {modules}.",
    "refusal.backup.install.failed.fix":
      "Leurs lignes disent ce qui a échoué et la commande qui les répare ; les données attendent qu'ils tournent.",
    "refusal.backup.probe.bucket": "Aucun seau de ce nom à ce point d'accès.",
    "refusal.backup.probe.bucket.fix":
      "Vérifiez le nom du seau et le point d'accès. Sur R2, un seau se crée dans R2 › Create bucket.",
    "refusal.backup.probe.denied":
      "Cette clé n'a pas le droit d'écrire dans ce seau, ou aucun seau ne porte ce nom.",
    "refusal.backup.probe.denied.fix":
      "Vérifiez le nom du seau : une clé limitée à un seau répond de même pour un nom qu'elle n'ouvre pas. Puis donnez à la clé Object Read & Write sur ce seau (R2 › Manage API tokens), et enregistrez à nouveau.",
    "refusal.backup.probe.delete":
      "Cette clé écrit dans le seau mais n'a pas le droit d'y effacer.",
    "refusal.backup.probe.delete.fix":
      "Les anciennes sauvegardes s'effacent avec la même clé : donnez-lui le droit de supprimer des objets, puis enregistrez à nouveau.",
    "refusal.backup.probe.keyId":
      "Le fournisseur ne connaît aucune clé d'accès avec cet identifiant.",
    "refusal.backup.probe.keyId.fix":
      "Recopiez l'identifiant de la clé d'accès tel que le tableau de bord l'affiche.",
    "refusal.backup.probe.secret":
      "La clé secrète ne correspond pas à cet identifiant de clé d'accès.",
    "refusal.backup.probe.secret.fix":
      "Recollez la clé secrète : elle n'est affichée qu'une fois, à la création de la clé. Sinon, créez-en une nouvelle.",
    "refusal.backup.probe.clock":
      "L'horloge de cet ordinateur est trop décalée pour le fournisseur.",
    "refusal.backup.probe.clock.fix":
      "Réglez la date et l'heure automatiquement dans les réglages du système, puis enregistrez à nouveau.",
    "refusal.backup.probe.unreachable": "{endpoint} ne répond pas : {reason}.",
    "refusal.backup.probe.unreachable.fix":
      "Vérifiez le point d'accès et la connexion de cet ordinateur, puis enregistrez à nouveau.",
    "refusal.backup.probe.refused":
      "Le seau a refusé l'écriture d'essai ({code}).",
    "refusal.backup.probe.refused.fix":
      "Vérifiez le seau, la clé et ses droits, puis enregistrez à nouveau.",
  },
};
