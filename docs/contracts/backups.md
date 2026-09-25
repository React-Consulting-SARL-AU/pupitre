# Sauvegardes

Une sauvegarde est ce qu'il faut pour refaire un serveur Pupitre ailleurs, ou le remettre dans l'état d'hier : sa configuration et ses secrets, ses bases, ses projets tels qu'ils sont, et les sessions du compte `dev`. L'agent la chiffre sur le serveur, la dépose dans le seau S3 du client — Cloudflare R2, AWS S3, tout ce qui parle S3 — et la plateforme n'en garde que l'adresse et un résumé sans un nom. Restaurer, c'est rendre la machine telle qu'elle était, projets démarrés.

Les types sont dans `packages/shared/src/backup/` (format, manifeste, déclaration) et `packages/shared/src/agent-protocol/backup.ts` (commandes). La décision est la [0013](../decisions/0013-sauvegardes-s3-chiffrees.md).

## Ce qu'une sauvegarde contient

Une sauvegarde est un préfixe du seau, un objet par partie, et un `manifest.json` écrit en dernier :

```txt
<prefix>/<server_id>/<backup_id>/
  manifest.json                      en clair, sans secret
  setup.pupitre                      configuration, registre, secrets des modules
  home.pupitre                       clés et sessions du compte dev
  db-postgres-roles.pupitre          rôles PostgreSQL (pg_dumpall --roles-only)
  db-postgres-flymate.pupitre        une base, pg_dump --format=custom
  db-mysql-users.pupitre             comptes MySQL faits à la main, empreintes et droits
  db-mysql-intranet.pupitre          une base, mysqldump
  db-mongodb-app.pupitre             une base, mongodump --archive
  db-redis.pupitre                   l'instantané RDB
  project-intranet.pupitre           le dossier du projet, .git compris
  path-notes.pupitre                 un dossier supplémentaire de /home/dev
```

`backup_id` vaut `YYYYMMDDTHHMMSSZ-xxxxxx` (UTC, six chiffres hexadécimaux tirés au hasard) : il se trie par date. `server_id` est l'identifiant du serveur sur la plateforme, que `/agent/state` rend désormais et que l'agent garde dans `/etc/pupitre/server.id`.

| Partie | Contenu (en clair, avant gzip) | Quand |
| --- | --- | --- |
| `setup` | un tar de `etc/pupitre/install.json`, `etc/pupitre/projects.local.json`, `etc/pupitre/projects.conf`, `etc/pupitre/migrations.json`, `etc/pupitre/env`, `var/lib/pupitre/projects.running.json` — ceux qui existent | toujours |
| `home` | un tar, relatif à `/home/dev`, des entrées de `BACKUP_HOME_PATHS` qui existent, sans `BACKUP_HOME_EXCLUDED` (`.ssh/authorized_keys`, et `.claude/remote`, les binaires que Claude retélécharge) ; restauré fichier par fichier, chacun écrit à côté puis renommé sur sa place, si bien qu'un binaire qui tourne est remplacé plutôt que refusé (`text file busy`) | `home` coché (défaut) |
| `database` | une base par partie, au format que dit `format` ; `name: "*"` pour ce qui appartient au serveur entier : les rôles PostgreSQL (`pg_roles`), les comptes MySQL ou MariaDB faits à la main (`mysql_users` : chacun supprimé puis recréé avec l'empreinte de son mot de passe — en hexadécimal sous MySQL 8 —, puis ses droits une fois tous les comptes faits ; `root`, les comptes système et les deux comptes du module n'y sont jamais, le module les refait), l'instantané Redis (`rdb`) | `databases` coché (défaut), pour chaque moteur installé ; les bases système (`postgres`, `template*`, `mysql`, `sys`, `information_schema`, `performance_schema`, `admin`, `config`, `local`) n'en sont pas |
| `project` | mode `full` : un tar du dossier du projet, `.git` compris, sans les dossiers de `BACKUP_EXCLUDED_DIRS` à quelque profondeur que ce soit ; mode `env` : les seuls fichiers ignorés par git dont le nom commence par `.env`, à la racine et dans le dossier de chaque processus | `projects` coché (défaut) ; le mode suit `projects_env_only`, et un projet sans dépôt est toujours `full` |
| `path` | un tar d'un chemin de `extra_paths`, relatif à `/home/dev` | un par chemin |

`install.json` porte les secrets des modules en clair — mots de passe des bases, jetons des outils, clés des fournisseurs de modèles, identifiants du tunnel : c'est ce qui fait qu'une restauration ne redemande rien. Le tar garde modes, liens symboliques internes et dates ; l'extraction redonne tout au compte `dev` (ou root pour `setup`), refuse un chemin absolu, un `..` et un lien qui sortirait de sa racine.

Un dossier de projet ou un chemin d'`extra_paths` qui est lui-même un lien est suivi s'il mène à un dossier de `/home/dev` : la partie porte ce qu'il y trouve, sous le nom du lien, et la restauration le remet là où le lien mène, le lien gardé. Les liens rencontrés à l'intérieur ne sont jamais suivis. Un lien qui mène hors de `/home/dev`, ou nulle part, laisse la partie de côté avec un avertissement, jamais une archive vide.

Ce qui n'y est jamais : `server.token`, `platform.url`, `entitlement.json`, les clés d'hôte SSH, `authorized_keys`, les binaires, les paquets, les runtimes, les dépendances des projets, les journaux, la galerie de captures, les volumes Docker.

## Le chiffrement

Le client choisit une **phrase de passe**, une fois, sur son laptop. L'app tire un sel de 16 octets, dérive par PBKDF2-HMAC-SHA256 (600 000 tours) une clé privée X25519 de 32 octets, en tire la clé publique — le *destinataire* — **puis oublie la phrase et la clé privée**. Rien ne garde la phrase : ni l'app, ni son trousseau, ni le serveur, ni la plateforme. Seuls le destinataire et le sel, qui ne sont pas des secrets, sont gardés et partent vers le serveur.

- **Le serveur chiffre et ne peut pas déchiffrer.** Chaque partie est scellée pour le destinataire : un seau exposé, un hébergeur curieux, une clé S3 qui fuit ne rendent que des octets opaques.
- **La phrase et un manifeste suffisent.** Le manifeste porte le destinataire, l'algorithme, les tours et le sel. Depuis n'importe quel ordinateur, la phrase tapée redonne la clé ; l'app compare le destinataire dérivé à celui du manifeste avant d'envoyer quoi que ce soit, et une mauvaise phrase est refusée sur le laptop.
- **Une identité par organisation.** Un second ordinateur de l'organisation reprend le destinataire et le sel de la dernière sauvegarde que la plateforme liste : la phrase n'est pas redemandée pour configurer, seulement pour restaurer. Changer de phrase tire un sel neuf ; les sauvegardes suivantes l'emploient, les anciennes restent ouvertes par l'ancienne.
- **Restaurer demande la phrase.** L'app la demande, dérive, vérifie, et envoie la clé privée sur la ligne de secrets d'une commande de restauration. L'agent s'en sert en mémoire, ne l'écrit ni ne la journalise. Entre la pose de la configuration et le retour des données — l'installation et le durcissement, quelques minutes — le processus principal de l'app garde la clé dérivée en mémoire pour ce seul serveur, jamais sur le disque ni dans la fenêtre, et l'efface dès que les données sont revenues ou que la restauration est abandonnée ; une app relancée entre les deux redemande la phrase.
- **Perdue, la phrase rend les sauvegardes illisibles.** Personne ne peut la recouvrer, et l'app le dit au moment de la choisir.

### Le conteneur

Chaque partie est `gzip` puis scellée, en flux, dans le conteneur que décrit `BACKUP_CONTAINER` :

```txt
en-tête  "PUPITRE\x01" · clé publique X25519 éphémère (32) · préfixe de nonce (8) · taille de bloc, uint32 gros-boutiste (4)
clé      HKDF-SHA256(X25519(éphémère, destinataire), sel = en-tête, info = "pupitre-backup-v1"), 32 octets
blocs    AES-256-GCM, nonce = préfixe · compteur uint32 gros-boutiste, aad = [1 pour le dernier bloc, 0 sinon]
```

Chaque bloc sauf le dernier tient exactement la taille de bloc (1 Mio à l'écriture) ; le dernier en tient moins, éventuellement rien, et lui seul est scellé comme final : une troncature ne s'ouvre pas. `fixtures.json` porte les vecteurs que Go et TypeScript vérifient ; `contracts:export` le recopie dans `apps/agent/internal/contract/backup.fixtures.json`.

### L'intégrité

Le manifeste porte le `sha256` de chaque objet chiffré ; la plateforme garde celui du manifeste, et l'app le passe dans `location.sha256`. L'agent refuse un manifeste dont l'empreinte diffère (`backup_corrupt`), puis chaque partie dont l'empreinte diffère, avant de la déchiffrer. Une partie scellée par un tiers qui connaîtrait le destinataire ne peut donc pas se glisser dans une sauvegarde que la plateforme a enregistrée.

## Le module `core.backup`

Catégorie `core`, facultatif, `runs: false`, `connection: "backup"`. Il ne pose rien sur la machine hormis sa configuration dans `install.json`.

| Champ | Genre | Défaut | Note |
| --- | --- | --- | --- |
| `endpoint` | text, motif `BACKUP_ENDPOINT_PATTERN`, managed | — | `https://<compte>.r2.cloudflarestorage.com`, `https://s3.<région>.amazonaws.com`. HTTPS seulement : en clair, la signature de chaque requête et l'identifiant de la clé passeraient sur le réseau, rejouables. Un stockage auto-hébergé se met derrière TLS |
| `region` | text, managed | `auto` | |
| `bucket` | text, managed | — | |
| `prefix` | text, managed | `pupitre` | sans barre oblique au bout |
| `path_style` | boolean, managed | vrai | faux pour un fournisseur qui exige l'adressage virtuel |
| `access_key_id` | text, managed | — | |
| `secret_access_key` | secret, managed | — | |
| `recipient` | text, managed | — | la clé publique, base64 |
| `kdf_salt` | text, managed | — | le sel, base64 |
| `interval_hours` | number 0–720 | 24 | 0 : aucune sauvegarde planifiée, seulement à la demande |
| `hour` | number 0–23 | 3 | heure locale du serveur où part une sauvegarde d'un jour ou plus |
| `keep` | number 1–365 | 14 | sauvegardes planifiées gardées ; les manuelles ne sont jamais élaguées |
| `databases` | boolean | vrai | |
| `home` | boolean | vrai | clés et sessions du compte `dev` |
| `projects` | boolean | vrai | les projets du registre |
| `projects_env_only` | boolean | faux | des projets à dépôt, les seuls fichiers `.env*` : le mode `env` ; décoché, le mode `full`. Un projet sans dépôt est toujours `full` |
| `extra_paths` | list de text, motif `BACKUP_EXTRA_PATH_PATTERN` | vide | chemins relatifs à `/home/dev` |
| `exclude_projects` | list de text, motif `BACKUP_PROJECT_ITEM_PATTERN` | vide | les projets laissés hors des sauvegardes, par leur nom |
| `exclude_databases` | list de text, motif `BACKUP_DATABASE_ITEM_PATTERN` | vide | les bases laissées hors des sauvegardes : `postgres:shop`, `mysql:intranet`, `mongodb:app`, `redis:*` |

**Tout part par défaut.** Les réglages nomment ce qui reste en dehors, jamais ce qui part : un projet ou une base créés après les réglages sont sauvegardés tant que personne ne les décoche — une sauvegarde qu'on croit complète et qui oublie le dernier projet serait la pire. `databases` et `projects` restent les interrupteurs de toute la catégorie. Les rôles PostgreSQL et les comptes MySQL partent avec leur moteur dès qu'une de ses bases part : une base restaurée a besoin de ses propriétaires. `backup.contents` rend la liste que l'app coche, avec pour chaque élément s'il part aujourd'hui, et le manifeste garde dans `excluded` ce qui est resté dehors.

**Ce qu'une restauration fait d'un élément laissé dehors.** Sur un serveur neuf, un projet exclu qui a un dépôt est cloné et installé — son code revient, pas son travail en cours — et un projet exclu sans dépôt quitte le registre, rien ne pouvant le ramener ; une base exclue n'est pas créée. Les deux se disent dans `warnings`. Sur un serveur qu'on remet à la sauvegarde, ce qui était exclu reste tel qu'il est : ni supprimé, ni retiré du registre.

Le préflight (`install.check`) vérifie ce que seule la machine sait : `HeadBucket`, puis l'écriture et la suppression d'un objet sonde sous `<prefix>/<server_id>/`. Chaque refus porte son remède : seau inconnu, accès refusé, point d'accès injoignable, horloge décalée (`RequestTimeTooSkewed`). Il ne juge que si le serveur détient déjà la clé secrète — `install.check` ne porte aucun secret — et rend alors un problème `connection` du module ; à la première installation, c'est l'étape `verify-bucket` de `Configure` qui fait la même sonde avec la clé de la ligne de secrets, et qui échoue avec le même remède.

## Le déroulé d'une sauvegarde

1. Prendre le verrou du moteur (`install.lock`) : une sauvegarde n'en croise jamais une autre, ni une installation.
2. Tirer l'identifiant, lire la dernière sauvegarde réussie dans `/var/lib/pupitre/backup.json`.
3. Pour chaque partie, dans l'ordre `setup`, `home`, bases, projets, chemins : calculer son empreinte de source quand c'en est une (un dossier : chemins, tailles, modes, dates ; un fichier : son contenu). Si elle égale celle de la même partie dans la sauvegarde précédente, pour le même destinataire, **copier l'objet dans le seau** (`CopyObject`) au lieu de le renvoyer. Sinon, produire la source en flux — `pg_dump` → gzip → scellement → envoi multipart par parts de 8 Mio — sans fichier temporaire sur le disque du serveur.
4. Une partie qui échoue est notée dans `warnings` avec sa phrase et n'arrête pas les autres ; un `setup` qui échoue arrête tout, car une sauvegarde sans configuration n'en est pas une.
5. Écrire `manifest.json`, puis déclarer la sauvegarde à la plateforme (`POST /agent/backups`). Une déclaration qui échoue est reprise par le daemon au tour suivant.
6. Élaguer : lister `<prefix>/<server_id>/`, lire les manifestes, garder les `keep` sauvegardes planifiées les plus récentes, effacer les autres objet par objet puis dire à la plateforme lesquelles sont parties (`DELETE /agent/backups/:id`). Un préfixe sans manifeste plus vieux qu'un jour est un envoi interrompu : il part aussi, avec les envois multipart abandonnés.
7. Écrire `/var/lib/pupitre/backup.json` : `{ running_since?, last_run_at, last_ok_at?, last_error?, last: { id, key, bytes, recipient, endpoint, bucket, parts[] }, pending_declarations[], pending_forgets? }`. `running_since` est posé le temps d'une sauvegarde ; `last` garde de quoi copier dans le même seau et pour le même destinataire ; `pending_forgets` nomme les sauvegardes élaguées dont la plateforme n'a pas encore reçu le `DELETE`, reprises par le daemon comme les déclarations.

Les commandes lourdes tournent en `nice 10` et `ionice -c3`. Les secrets des moteurs passent comme pour `db.dump` : jamais sur une ligne de commande.

## L'ordonnancement

Le daemon lit `install.json` à chaque tour de trente secondes. Quand `core.backup` est installé et configuré, que `interval_hours` est positif et que l'échéance est passée, il lance une sauvegarde `schedule`. L'échéance suit la dernière tentative : `last_run_at + interval_hours` ; un intervalle d'un jour ou plus s'aligne sur `hour`, heure locale du serveur. Une échéance manquée pendant un arrêt est rattrapée une fois au réveil ; un serveur qui n'a jamais sauvegardé part à `hour` le jour même, ou tout de suite si l'heure est passée. Un verrou tenu fait attendre le tour suivant. Un serveur en mode restreint ne sauvegarde pas ; en tolérance, si.

Le heartbeat porte `backup: BackupBeat` — `{ interval_hours, last_run_at?, last_ok_at?, last_error?, last_warnings? }` — quand le module est installé. `last_warnings` compte les parties que la dernière sauvegarde n'a pas pu emporter ; `backup.status` en rend les phrases dans `last.warnings`, et l'app les montre sous l'état. Une sauvegarde incomplète existe, mais ce qui lui manque ne reviendrait pas : c'est un échec pour les alertes.

## Les commandes

Dans `agent-protocol.md`, section « Sauvegardes ». Aucune n'est ouverte en mode restreint ni avant l'enrôlement ; aucune ne l'est tant que la configuration attend une migration.

| Commande | Rôle |
| --- | --- |
| `backup.status` | où en sont les sauvegardes de ce serveur |
| `backup.contents` | les projets et les bases que ce serveur tient, et si chacun part dans les sauvegardes |
| `backup.run` | une sauvegarde maintenant, avec le nom facultatif que le lecteur lui donne (`name`, 80 caractères au plus, ni espace au bord ni caractère de contrôle — `BACKUP_NAME_PATTERN`), porté par le manifeste et la déclaration ; événements `step` du module `core.backup` (`setup`, `home`, `db:<moteur>:<nom>`, `project:<nom>`, `path:<chemin>`, `manifest`, `declare`, `prune`) |
| `backup.delete` | efface une sauvegarde de ce serveur dans le seau, puis sur la plateforme |
| `backup.inspect` | lit et vérifie le manifeste d'une sauvegarde, sans rien écrire |
| `backup.restore.setup` | pose la configuration d'une sauvegarde, migrée à la révision du binaire |
| `backup.restore.data` | ramène bases, projets, chemins et `home`, puis démarre les projets |
| `backup.restore.abort` | abandonne une restauration commencée avant son installation |

`backup.inspect`, `backup.restore.setup` et `backup.restore.data` lisent la ligne de secrets `BackupSecrets` : la clé S3 et, pour une restauration, la clé privée.

## Restaurer

Deux cas, un même chemin.

**Un serveur neuf**, pendant l'onboarding. `backup.restore.setup` refuse une machine qui a déjà une installation, sauf si la seule configuration qu'elle porte vient d'une restauration en cours.

**Un serveur existant qu'on remet à une sauvegarde** (`revert: true`). L'app propose d'abord une sauvegarde de l'état actuel, cochée par défaut : c'est ce qui permet de revenir en arrière du retour en arrière. Puis l'agent arrête tous les projets, pose la configuration et le registre de la sauvegarde ; les projets que la sauvegarde ne connaît pas quittent le registre (`dropped`), leurs dossiers restent. `extra` nomme les modules installés que la sauvegarde ne tient pas ; l'app propose de les désinstaller.

Dans les deux cas :

1. **`backup.restore.setup`** télécharge le manifeste, vérifie son empreinte, puis `setup`, le déchiffre, lit sa révision : en retard, elle est migrée par le registre de migrations exactement comme une configuration sur place ; en avance, refus `backup_unsupported` avec le remède « mettez l'agent à jour ». Un format de manifeste inconnu refuse de même. Les fichiers sont posés, une marque `/var/lib/pupitre/restore.json` dit qu'une restauration est en cours et depuis quelle sauvegarde.
2. **L'installation** : l'app nomme `modules` et `defer`, `module.config` lui rend les valeurs de chacun, et les secrets restaurés sont tenus pour détenus — un secret absent de la ligne de secrets n'est pas effacé. Une connexion que ce laptop n'a pas ne bloque pas un module restauré : ses champs gérés sont déjà sur la machine.
3. **Le durcissement**, pour un serveur neuf.
4. **`backup.restore.data`**, les parties choisies, dans l'ordre `home`, bases, chemins, projets. Une base est supprimée et recréée avant l'import ; les rôles PostgreSQL passent avant les bases, un rôle déjà là n'est pas une erreur. Un projet `full` voit son dossier remplacé en entier — branche, fichiers modifiés, commits non poussés reviennent tels quels, sans clone ; un projet `env` est cloné (`project.pull`) puis reçoit ses fichiers `.env*`. Chaque projet reçoit ensuite ce que `project.add` fait après sa ligne : hôtes `.localhost`, routes de l'exposition, épingles de runtimes, `project.install`. Enfin, avec `start` (défaut), les projets que le manifeste dit en marche sont démarrés, et ceux qui démarrent au boot aussi. Une partie qui échoue est notée `failed` avec sa commande de rejeu et n'arrête pas les autres. La marque de restauration est effacée à la fin.

Les étapes de `backup.restore.data` s'appellent comme celles d'une sauvegarde pour les parties, puis `hosts`, `runtimes`, `routes`, `install:<projet>` et `start:<projet>`. Une restauration n'a pas de commande sur la machine — la clé privée n'y reste pas — : le `replay` d'une étape en échec est la requête que l'app renvoie, `backup.restore.data {"parts":["<clé>"]}`, `project.install {"name":"<projet>"}`, `project.up {"name":"<projet>"}` ou `tunnel.sync` ; un projet exclu que la restauration clone ou retire du registre passe par une étape `project:<projet>`, rejouée par `project.pull` ou `project.remove`. Une étape d'après les parties qui échoue va dans `warnings`, pas dans `failed`, qui ne nomme que des parties.
5. **L'app** appelle `platform.sync`, puis `POST /backups/:id/restored`.

`backup.restore.abort` efface la marque et, si aucune installation n'a eu lieu depuis, remet la configuration d'avant la restauration : rien pour un serveur neuf — `install.json` et le registre à vide —, celle que la machine portait pour un `revert`. `backup.restore.setup` la garde de côté pour ça sous `/var/lib/pupitre/restore/before/` (0700 root), à la première restauration seulement, et la marque retient l'empreinte d'`install.json` telle que la restauration l'a laissée : une installation passée depuis la change, et l'abandon n'efface alors que la marque.

Un client ouvre une partie sans Pupitre : `pupitred backup open --salt=<sel du manifeste> FICHIER` lit la phrase de passe sur l'entrée standard, `pupitred backup open --private-key FICHIER` la clé privée, et la partie sort déchiffrée et décompressée sur la sortie standard.

## La plateforme

Une table `Backup`, des routes, deux alertes. Le détail est dans [platform-api.md](./platform-api.md#sauvegardes).

- `POST /agent/backups` (jeton de serveur) déclare une sauvegarde, `BackupDeclaration` ; idempotent sur l'identifiant.
- `DELETE /agent/backups/:id` (jeton de serveur) retire la référence d'une sauvegarde de ce serveur.
- `GET /backups` et `GET /servers/:id/backups` (session) listent les sauvegardes de l'organisation, les plus récentes d'abord ; un `member` ne voit que celles des serveurs qui lui sont attribués.
- `POST /backups/:id/forget` (`admin`) efface une référence sans toucher au seau.
- `POST /backups/:id/restored` (session) note une restauration dans le journal.
- `backup_failed` quand le dernier battement porte une erreur plus récente que le dernier succès, ou une dernière sauvegarde incomplète (`last_warnings` positif) ; `backup_stale` quand deux intervalles sont passés sans succès.

## L'app

- **La page Sauvegardes d'un serveur** — l'assistant de mise en place, puis l'onglet Destination, qui applique au serveur tout changement aussitôt enregistré ; plus rien dans les Réglages : point d'accès, région, seau, préfixe, adressage, clé d'accès et clé secrète (au trousseau), et la phrase de passe — tapée deux fois, ou générée, puis oubliée. Si l'organisation a déjà des sauvegardes, l'identité de la plus récente est reprise sans phrase.
- **La fiche du serveur, section Sauvegardes** : l'état, le formulaire du module (intervalle, heure, rétention, contenu), « Sauvegarder maintenant », la liste lue de la plateforme avec, pour chacune, « Revenir à cette sauvegarde » et « Supprimer ».
- **L'onboarding** : quand l'organisation a des sauvegardes, l'étape « Repartir d'une sauvegarde ? » vient après l'agent et avant le catalogue ; l'étape « Données » vient après le durcissement.

## Limites

- Les volumes Docker ne sont pas sauvegardés ; l'app le dit quand `runtime.docker` est installé.
- Un mot de passe de base de données changé à la main hors de Pupitre revient à celui que `install.json` tient.
- La plateforme voit une adresse, des tailles, des comptes, une révision, une clé publique et, pour une sauvegarde manuelle, le nom que le lecteur lui a donné ; elle ne voit aucun nom de projet ni de base.
- Qui tient la clé S3 peut effacer les sauvegardes : le versionnage ou le verrouillage d'objets du seau sont la parade, et le guide les mentionne.
- Qui lit le seau lit les manifestes, en clair : le nom du serveur, les noms des projets, des bases et des dossiers, l'adresse et la branche des dépôts. Jamais un contenu, un secret ni un fichier : ceux-là sont scellés. C'est le prix d'un écran de restauration qui montre ce qu'une sauvegarde contient avant qu'on donne la phrase, et le guide le dit.
- La confidentialité est de bout en bout ; l'authenticité d'une sauvegarde repose sur l'empreinte de son manifeste que garde la plateforme. Une plateforme compromise ne lirait rien, mais pourrait désigner une sauvegarde plus ancienne du même client à la place de la dernière.
- La clé dérive de la phrase par PBKDF2-SHA256 à 600 000 tours, au niveau recommandé aujourd'hui ; une phrase tapée de douze caractères est le maillon faible, et l'app propose une phrase tirée de 120 bits.
