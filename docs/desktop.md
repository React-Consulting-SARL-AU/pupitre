# L'app desktop, de l'intérieur

Ce que fait le processus principal de `apps/desktop` et pourquoi. Les règles d'une ligne sont dans [`apps/desktop/CLAUDE.md`](../apps/desktop/CLAUDE.md) ; ce document tient les déroulés qu'elles résument. Le protocole est dans [`contracts/agent-protocol.md`](./contracts/agent-protocol.md), les migrations dans [`contracts/config-migrations.md`](./contracts/config-migrations.md), le design dans [`product/DESIGN.md`](./product/DESIGN.md).

## Les canaux vers l'agent

`src/main/agent-client.ts` tient, par serveur, des sessions SSH qui lancent `pupitred serve` ; les requêtes sont sérialisées, `id` croissant. Cinq canaux — quatre sur la session que sudo ouvre sans mot de passe, un privilégié :

- **contrôle** : les gestes.
- **travail** : les commandes longues et les lectures bornées (`project.sync`, `fs.read`, `shots.read`).
- **battement** : les lectures qu'un écran fait sur minuterie (`agentPoll` : `snapshot`, `processes.list`), pour qu'un clic n'attende jamais derrière la lecture du tableau de bord.
- **suivi** : les journaux suivis (`project.logs`, `service.logs`), qui tiennent leur canal tant que le lecteur reste — le panneau d'un service montre son journal à côté du formulaire, et l'`install` qui applique le formulaire ne doit pas attendre que le lecteur ferme le panneau. Les lignes passent par `lib/journal-buffer.ts`, qui les tient comme un terminal — retour chariot, curseur remonté, effacement de ligne — au lieu de coller chaque redessin de Gradle bout à bout, et `ui/journal-pane.tsx` les dessine : adresses cliquables, marques `=== pupitre up|down … ===` de l'agent rendues comme des règles, suivi de la fin lâché dès qu'on remonte ou qu'on pose le pointeur pour sélectionner.
- **privilégié** : ce que le contrat garde pour `pupitred serve --privileged` (`requiresPrivilege` de `@pupitre/shared/agent-protocol` : `install`, `harden`, `service.secret`, `backup.*` qui écrivent, `enroll`, `keys.trust`…), ouvert à la demande et refermé après une minute sans usage. En `dev`, il lance `privilegedServeAs` et écrit le mot de passe sudo que garde `sudo-held.ts` sur la première ligne de l'entrée standard, où `sudo -S` le lit — le shell le lit à sa place sous la règle d'avant ; en root, `pupitred serve --privileged` tout court. Un second prompt de sudo (`pupitre-sudo:`) sur la sortie d'erreur est le mot de passe refusé : le canal coupe, répond `privilege_required` (`refusal.sudo.refused`, ou `refusal.sudo.absent` sans mot de passe sur cet ordinateur) et ne le retente pas tant que `resetPrivileged` ne l'a pas relâché. Voir [deux sessions](./contracts/agent-protocol.md#deux-sessions--sans-mot-de-passe-et-privilégiée).

Jamais de `ssh` par appel. Un canal qui tombe pendant `install`, `upgrade` ou `harden` se rouvre aussi longtemps que la commande avait de temps, et le rapport de l'agent — écrit avant chaque étape — se relit jusqu'à `finished_at` ; un canal que l'app a fermé elle-même ne se rouvre pas.

Le renderer nomme les commandes du protocole sur `agent:call` ; `src/main/agent-bridge.ts` n'en laisse passer que celles de `BRIDGE_COMMANDS`, avec des paramètres de la forme du contrat, vers un serveur connu et un service que l'agent vient de lister. Un canal IPC dédié n'existe que quand le main ajoute ou retient quelque chose : un secret, un jeton, un chemin local, un `ssh`, un fichier.

## SSH : configuration, clés, partage

La configuration SSH est celle de l'app : `userData/ssh/config` passé avec `-F`, clés dans `userData/keys/` en 0600, clé d'hôte épinglée. Le fichier nomme la clé et le `known_hosts` à travers `~/.pupitre/<dossier>` — un lien symbolique (une jonction sur Windows) vers le dossier de données, posé à chaque écriture — parce que `~/Library/Application Support` porte un espace et que JetBrains Gateway, qui lit ce fichier avec son propre analyseur, coupe `IdentityFile` et `UserKnownHostsFile` sur l'espace, guillemets ou non. Un serveur accordé arrive avec son empreinte et rien dans le `known_hosts` : `hostKey()` y écrit la clé que la machine présente quand c'est celle du pin.

`~/.ssh/config` de l'utilisateur n'est jamais réécrit. Sur un geste explicite (Réglages › SSH, ou un bouton « Ouvrir dans » qui la demande d'abord), `ssh-share.ts` y pose une seule ligne `Include` vers le fichier de l'app, en tête, et la retire de même. Chaque bloc de l'app porte `pupitre-<id>` et, quand aucun hôte du système ne le prend, le nom SSH du serveur (`slug` de `servers.json`, `ssh atelier`) : un mot choisi par le lecteur à l'ajout et modifiable depuis la fiche du serveur, tiré du nom quand rien n'est tapé, refusé quand une autre machine y répond déjà (`sshNameFree`) ; les liens des éditeurs nomment ce mot. Un hôte existant peut être désigné.

## Poser la clé sur un serveur

Le formulaire d'ajout frappe avant de créer quoi que ce soit (`knock.ts`) : l'adresse parle-t-elle SSH, et qu'est-ce qui ouvre le compte — ce que l'ordinateur détient déjà, un mot de passe, ou rien.

Le mot de passe se demande là, part avec le brouillon, et `server-add-run.ts` crée la clé puis la pose dans le même geste ; un mot de passe refusé ne crée rien et revient au formulaire. `key-install.ts` essaie dans l'ordre : la machine s'ouvre déjà, ce que l'ordinateur détient déjà l'ouvre, puis le mot de passe du compte distant. Le mot de passe traverse le pont une fois, part par l'aide `SSH_ASKPASS` — jamais une ligne de commande, jamais un fichier — et est oublié. On ne rend la ligne `ssh-copy-id` à coller que quand l'app ne peut pas faire le travail.

## Le compte et l'installation

Le jeton bearer vit dans `safeStorage` et ne traverse jamais le pont. `src/main/keychain.ts` est la seule porte vers le trousseau, pour ce jeton comme pour ceux des connexions : sous Linux, sans GNOME Keyring ni KWallet, Chromium chiffre par `basic_text`, une clé écrite en dur — l'app n'y écrit rien, garde le secret jusqu'à sa fermeture et le dit, avec le remède. Le serveur est enrôlé auprès de la plateforme, puis le binaire de l'agent est téléchargé depuis elle, somme et signature vérifiées, avant d'être poussé : écrit tel quel en root sur un serveur nu, confié à `sudo -n pupitred binary install`, qui revérifie la signature, sur un serveur joint en `dev` (`agent-binary.ts`) — la version et la signature sur la première ligne de l'entrée standard, jamais en arguments ; un agent de développement, sans signature, passe par `binary install --privileged` avec le mot de passe sudo devant (`pushedInput`). Sans compte, seul un build de développement installe.

La sécurisation finit sur le mot de passe sudo de `dev` (décision 0015) : `runSecuring` (`harden-run.ts`) enchaîne `harden` puis, une fois l'app reconnectée en `dev`, `harden.sudo` (`sudo-run.ts`). Le mot de passe est tiré et haché en SHA-512 `crypt` dans le main (`sudo-password.ts`), l'empreinte part sur la ligne de secrets, le mot de passe va au trousseau (`sudo-vault.ts`, `userData/sudo/<serveur>.password`) — ou en mémoire, dit à l'écran, sans trousseau — dès que l'agent l'a posé. La fiche du serveur (Réglages › Serveurs) le montre masqué, à révéler (`sudo:reveal`) ou copier dans le main (`sudo:copy`). Un ordinateur qui ne le tient pas ne peut faire aucun geste privilégié, relancer la sécurisation compris : la fiche le fait saisir (`server-sudo-enter-dialog.tsx`, `sudo:enter`), et `enterSudoPassword` ne le garde qu'une fois qu'un canal privilégié s'est ouvert avec lui, sur un serveur dont `snapshot.machine.sudo` vaut `password`. Le tableau de bord la propose aussi tant que `snapshot.machine.sudo` vaut `nopasswd_all` (`lib/server-security.ts`).

Un build de développement parle à la console locale — `http://localhost:3000`, celle que `bun run dev:web` sert — et un build empaqueté à `app.pupitre.studio` ; `PUPITRE_PLATFORM_URL` désigne une autre plateforme à un build de développement, jamais à un build empaqueté, qui ignore aussi `PUPITRE_AGENT_PLATFORM_URL` et `PUPITRE_E2E` : une variable posée par n'importe quoi sur la machine n'envoie ni le jeton ni l'enrôlement ailleurs. La sorte de build (`platform-url.ts`) suit la plateforme, pas le dossier : un build de développement dirigé vers une plateforme hébergée (`bun run dev:desktop:prod` depuis la racine) se conduit en production — droit d'usage du compte, agent de la release nommée, aucun préremplissage — dans un dossier de données à elle, `Pupitre Dev (<hôte>)`.

## Mettre l'agent à jour

Trois gestes, dans cet ordre : `agent.upgrade`, la fermeture du canal — le `serve` qui répond tient encore l'ancien binaire, remplacé par un `rename` — puis `agent.migrate`, et seulement ensuite `upgrade` sur les modules. Un serveur dont la configuration n'est pas la forme que son agent lit refuse tout le reste lui-même ; le bandeau le dit et n'offre que la migration.

## Les fichiers que l'app garde

`servers.json`, `account.json` et `transfers.json` passent par `store-migrations.ts` : une entrée numérotée par changement de forme, du JSON brut en entrée comme en sortie, une copie `<fichier>.r<révision>` avant le premier changement. Un fichier écrit par une version plus récente n'est jamais réécrit.

## Les transferts

Un fichier lourd ne passe pas par le canal de l'agent. `transfers-run.ts` lance un `rsync` par transfert sur la configuration SSH de l'app — donc sur la session maître, sans seconde authentification — avec `--partial --append-verify --info=progress2`, et `scp` quand `rsync` manque d'un côté, vérifié par `sha256`. Deux à la fois, les autres attendent ; une coupure réseau relance avec un délai croissant ; ce qui reste à faire est écrit dans `transfers.json` et repris au lancement. Le chemin distant est relatif à la racine de l'agent et validé par le main ; le chemin local vient d'une boîte de dialogue ou d'un dépôt, jamais d'une chaîne du renderer.

## L'onboarding

L'ordre est une machine, les écrans dessinent. `stores/onboarding-machine.ts` dit quelle étape suit quelle réponse et ce qu'entrer dans une étape déclenche ; le store exécute les effets. Aucun écran de l'onboarding n'agit dans un `useEffect`, et une étape ne se rejoint que par un événement qui la justifie.

Entrer dans l'inspection demande aussi à la plateforme les sauvegardes de l'organisation (`backupsListed`) : quand elle en a, l'agent mène à l'étape « Repartir d'une sauvegarde ? » plutôt qu'au catalogue. Une sauvegarde prise (`restored`) ouvre le catalogue et la configuration sur ce qu'elle tenait, lu par `module.config` ; les secrets que la machine tient déjà comptent pour donnés et ne sont ni redemandés ni régénérés. Revenir au choix abandonne la restauration (`backup.restore.abort`). Après la sécurité, une machine restaurée passe par l'étape « Données » avant d'être prête.

## Les sauvegardes

Le contrat est [`contracts/backups.md`](./contracts/backups.md). La connexion au seau — donnée dans la page Sauvegardes d'un serveur, jamais dans les Réglages — garde les réglages du seau et la clé publique dans `backup.json`, la clé secrète dans `safeStorage` comme tout jeton ; la phrase de passe traverse le pont une fois, est dérivée dans le main (`@pupitre/shared/backup/crypto`) et n'est gardée nulle part. Un premier ordinateur choisit la phrase ; les suivants reprennent la clé publique et le sel de la dernière sauvegarde que la plateforme liste. Une phrase tirée par l'app ne s'enregistre qu'une fois cochée « notée ailleurs ». Avant de garder quoi que ce soit, le main écrit puis efface un petit objet `<prefix>/.pupitre-probe-<hasard>` avec une requête signée SigV4 (`src/main/s3.ts`, `node:crypto`, vérifié sur l'exemple de référence d'AWS) : seau inconnu, droit d'écrire ou d'effacer manquant, identifiant ou clé secrète faux, point d'accès muet, horloge décalée ont chacun leur phrase sous le formulaire. Le point d'accès n'est accepté qu'en `https://`. La connexion tenue montre une empreinte courte de la clé publique (seize chiffres hexadécimaux du SHA-256 du destinataire), la même sur chaque ordinateur de l'organisation.

Restaurer passe par `backup:restore-setup` puis `backup:restore-data` (`src/main/backups.ts`, déroulé dans `backups-run.ts`) : la phrase est vérifiée sur ce laptop contre la clé publique de la sauvegarde avant que rien ne parte, puis la clé S3 et la clé privée dérivée partent sur la ligne de secrets. Entre la configuration et les données — l'installation et le durcissement courent entre les deux — le main tient la clé privée en mémoire pour ce serveur, et la met à zéro une fois les données revenues ou la restauration abandonnée ; un app relancée entre-temps redemande la phrase. Pendant ce temps, une connexion que ce laptop n'a pas ne bloque pas l'installation d'un module restauré : ses valeurs gérées sont déjà sur la machine.

La page « Sauvegardes » d'un serveur lit `backup.status`, `backup.contents` et la liste de la plateforme. Un serveur où `core.backup` n'est pas encore configuré y suit une mise en place en quatre étapes (`backups-setup.tsx`) : le seau — celui que cet ordinateur tient déjà, ou un nouveau choisi par fournisseur, R2 ne demandant que l'identifiant du compte et AWS que la région, éprouvé par l'écriture d'essai seule (`backup:probe`) —, la phrase de passe, qui garde la connexion une fois passée, la fréquence, puis le contenu, et « Activer les sauvegardes » applique le module et lance, si on le laisse coché, une première sauvegarde. Une fois en place, la page montre l'état, la destination (la connexion de cet ordinateur, et un avertissement quand le serveur sauvegarde encore vers un autre seau ou pour une autre clé, qui ouvre Appliquer), la fréquence dite en mots avec la rétention traduite en temps, et le contenu : chaque base et chaque projet que le serveur tient, cochés par défaut ; décocher un élément l'ajoute à `exclude_databases` ou `exclude_projects`, et une exclusion qui nomme un élément disparu reste affichée, décochée, plutôt que d'être perdue — sur le même brouillon du store `services` et le même Appliquer que la page d'un service. La pesée d'avant Appliquer (`install:check`) porte les valeurs gérées que le trousseau donne sans secret ni tunnel (`weighedValues`), et un refus qu'aucun champ ne porte est nommé au pied du formulaire, jamais réduit à un nombre. L'agent juge alors le seau avec la clé secrète qu'il tient encore, pas celle que l'installation va porter : son verdict `connection` sur un module dont l'app fournit les valeurs gérées est écarté, sans quoi changer de clé serait refusé par l'ancienne. L'onglet Destination montre ce que le serveur tient (seau, point d'accès, identifiant de clé, empreinte), enregistre une destination changée sur cet ordinateur puis l'applique aussitôt au serveur, clé secrète comprise, et renvoie à la demande la clé de cet ordinateur ; « Réinitialiser les sauvegardes » désinstalle `core.backup` du serveur — les sauvegardes faites restent dans le seau et la liste — et, cochée par défaut, oublie aussi le seau de cet ordinateur, puis la mise en place reprend. La page d'un service `core.backup` renvoie à la page Sauvegardes. « Revenir à cette sauvegarde » tient la fenêtre dans un dialogue verrouillé — ni Échap ni le voile ne le ferment avant la fin — et enchaîne, chaque phase dite : sauvegarde de l'état actuel (cochée par défaut), configuration, installation, choix des modules que la sauvegarde ne tient pas, données, `platform.sync` et note de la restauration sur la plateforme.

## La trace en développement

`trace.ts` écrit ce que fait le processus principal — chaque `ssh`, chaque commande de l'agent, chaque phase d'un enrôlement — sur la sortie du processus principal et dans la console de la fenêtre. Rien dans un build empaqueté ; `PUPITRE_TRACE=1` l'allume ailleurs. Aucune valeur dont le nom sent le secret n'y est écrite.

## Arborescence

```
src/main/        le processus principal, un fichier par sujet — agent-client, servers, keys, key-install, ssh-config, host-keys, install, harden, projects, services, terminals, account, connections, platform-client, updater, trace… — et un `<sujet>-run.ts` à côté quand une opération longue a un déroulé à part
src/preload/     index.ts — la surface IPC, typée
src/renderer/src/
  components/ui/          Base UI + shadcn, un composant par fichier
  components/shell/       barre latérale et son volet des transferts, écrans de garde (premier lancement, aucun serveur, serveur restreint ou non prêt), frontière d'erreur
  components/onboarding/  le parcours : serveur · inspection · agent · sauvegarde · config · durcissement · données · fin, et son rail
  components/catalog/     choix des modules et des presets
  components/config/      le formulaire d'un module : champs, secrets, listes, bloc de connexion
  components/install/     progression, journal, rapport
  components/connections/ les comptes tiers que l'app tient pour le client
  components/servers/     ajout, clé, alerte de clé d'hôte, joignabilité
  components/dashboard/   machine, services, projets
  components/projects/    l'écran d'un projet — git, diff, branches, logs, éditeurs — et l'ajout d'un projet
  components/services/    l'écran des services : configuration, identifiants, base, tunnel, retrait
  components/terminals/   xterm, onglets, barres d'état, complétion
  components/activity/    sessions et processus
  components/fleet/       les organisations et leurs serveurs
  components/shots/       la galerie
  components/backups/     les sauvegardes d'un serveur : mise en place pas à pas, état, réglages, liste, sauvegarde immédiate, retour à une sauvegarde
  components/files/       le navigateur de fichiers et l'éditeur basique : liste d'un dossier, fil d'Ariane, menu d'une entrée, aperçu, CodeMirror sur la palette ANSI du terminal
  components/updates/     bandeau et notes de mise à jour de l'agent, migration de sa configuration, mise à niveau des modules
  components/account/     connexion, identité, usage, abonnement
  components/settings/    apparence, connexions, terminal, notifications, démarrage, à propos (version, canal, mise à jour de l'app)
  components/help/        la vue « Aide » (bas de la barre latérale) : comment ssh, Claude Code, Codex et les éditeurs joignent le serveur piloté, avec ses valeurs lues du fichier SSH de l'app (`ssh-share:state`) et les modules du snapshot
  stores/                 un store Zustand par sujet : servers · snapshot · onboarding et onboarding-machine (l'ordre, pur) · install · harden · sudo-password · inspection · catalog · connections · services · project · project-add · files · transfers · terminals · shots · backups · backup-connection · restore · fleet · account · agent-update · app-update · preferences · reenroll · tunnel · channel · announcements · navigation · locale · theme
  lib/                    fonctions pures et hooks : format, duration, memory (navigation), completion, terminals, remedy, refusals, roles, use-pending, use-history-shortcuts…
  i18n/strings/           les textes, un fichier par sujet, `en` et `fr`
```

## Tests

`bun test` pour le main et les stores (agent factice qui rejoue des transcriptions dans `src/main/__tests__/fixtures/`, `stubPupitre` pour `window.pupitre`). Toute la suite tourne sous un document happy-dom enregistré par le preload (`src/renderer/src/__tests__/dom-register.ts`, avant React et Base UI, qui décident au chargement s'ils ont un navigateur ; le réseau et les horloges restent ceux de Bun) : un écran se lit d'ordinaire par `renderToStaticMarkup`, et ce qui flotte — dialogue, liste d'un `Select`, menu — se monte avec `mount` et se lit avec `optionsOf` (`__tests__/dom.tsx`), parce qu'un portail ne rend rien dans une chaîne. Playwright pour Electron dans `e2e/` : l'onboarding complet et la configuration contre le harnais de `e2e/harness/onboarding.ts`, captures des thèmes, et une passe axe sur chaque écran couvert (`e2e/harness/accessible.ts`). `src/main/__tests__/ipc-surface.test.ts` vérifie que chaque canal que le preload appelle est répondu par le main et par le harnais.

Les contrôles dessinés par l'app se pilotent par leur rôle : `getByRole("tab")` pour un onglet, `getByRole("switch")` pour une préférence, `getByRole("radio")` pour une carte de choix, `getByRole("alertdialog")` pour une confirmation, et `pickOption` / `toggle` de `e2e/harness/controls.ts` pour un `Select` et un interrupteur.

Les captures du tableau de bord ne sont comparées que sur macOS, où vivent leurs références (`e2e/references/*-darwin.png`) ; elles se régénèrent avec `bunx playwright test e2e/themes.spec.ts --update-snapshots` quand l'écran change exprès. Sur Linux, le scénario vérifie le thème sans image. La suite e2e ne montre jamais la fenêtre (`foreground.ts`, `discretion.spec.ts`).
