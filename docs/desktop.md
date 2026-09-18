# L'app desktop, de l'intérieur

Ce que fait le processus principal de `apps/desktop` et pourquoi. Les règles d'une ligne sont dans [`apps/desktop/CLAUDE.md`](../apps/desktop/CLAUDE.md) ; ce document tient les déroulés qu'elles résument. Le protocole est dans [`contracts/agent-protocol.md`](./contracts/agent-protocol.md), les migrations dans [`contracts/config-migrations.md`](./contracts/config-migrations.md), le design dans [`product/DESIGN.md`](./product/DESIGN.md).

## Les canaux vers l'agent

`src/main/agent-client.ts` tient, par serveur, une session SSH qui lance `pupitred serve` ; les requêtes sont sérialisées, `id` croissant. Quatre canaux :

- **contrôle** : les gestes.
- **travail** : les commandes longues et les lectures bornées (`install`, `fs.read`, `shots.read`).
- **battement** : les lectures qu'un écran fait sur minuterie (`agentPoll` : `snapshot`, `processes.list`), pour qu'un clic n'attende jamais derrière la lecture du tableau de bord.
- **suivi** : les journaux suivis (`project.logs`, `service.logs`), qui tiennent leur canal tant que le lecteur reste — le panneau d'un service montre son journal à côté du formulaire, et l'`install` qui applique le formulaire ne doit pas attendre que le lecteur ferme le panneau. Les lignes passent par `lib/journal-buffer.ts`, qui les tient comme un terminal — retour chariot, curseur remonté, effacement de ligne — au lieu de coller chaque redessin de Gradle bout à bout, et `ui/journal-pane.tsx` les dessine : adresses cliquables, marques `=== pupitre up|down … ===` de l'agent rendues comme des règles, suivi de la fin lâché dès qu'on remonte ou qu'on pose le pointeur pour sélectionner.

Jamais de `ssh` par appel. Un canal qui tombe pendant `install`, `upgrade` ou `harden` se rouvre aussi longtemps que la commande avait de temps, et le rapport de l'agent — écrit avant chaque étape — se relit jusqu'à `finished_at` ; un canal que l'app a fermé elle-même ne se rouvre pas.

Le renderer nomme les commandes du protocole sur `agent:call` ; `src/main/agent-bridge.ts` n'en laisse passer que celles de `BRIDGE_COMMANDS`, avec des paramètres de la forme du contrat, vers un serveur connu et un service que l'agent vient de lister. Un canal IPC dédié n'existe que quand le main ajoute ou retient quelque chose : un secret, un jeton, un chemin local, un `ssh`, un fichier.

## SSH : configuration, clés, partage

La configuration SSH est celle de l'app : `userData/ssh/config` passé avec `-F`, clés dans `userData/keys/` en 0600, clé d'hôte épinglée. Le fichier nomme la clé et le `known_hosts` à travers `~/.pupitre/<dossier>` — un lien symbolique (une jonction sur Windows) vers le dossier de données, posé à chaque écriture — parce que `~/Library/Application Support` porte un espace et que JetBrains Gateway, qui lit ce fichier avec son propre analyseur, coupe `IdentityFile` et `UserKnownHostsFile` sur l'espace, guillemets ou non. Un serveur accordé arrive avec son empreinte et rien dans le `known_hosts` : `hostKey()` y écrit la clé que la machine présente quand c'est celle du pin.

`~/.ssh/config` de l'utilisateur n'est jamais réécrit. Sur un geste explicite (Réglages › SSH, ou un bouton « Ouvrir dans » qui la demande d'abord), `ssh-share.ts` y pose une seule ligne `Include` vers le fichier de l'app, en tête, et la retire de même. Chaque bloc de l'app porte `pupitre-<id>` et, quand aucun hôte du système ne le prend, le nom SSH du serveur (`slug` de `servers.json`, `ssh atelier`) : un mot choisi par le lecteur à l'ajout et modifiable depuis la fiche du serveur, tiré du nom quand rien n'est tapé, refusé quand une autre machine y répond déjà (`sshNameFree`) ; les liens des éditeurs nomment ce mot. Un hôte existant peut être désigné.

## Poser la clé sur un serveur

Le formulaire d'ajout frappe avant de créer quoi que ce soit (`knock.ts`) : l'adresse parle-t-elle SSH, et qu'est-ce qui ouvre le compte — ce que l'ordinateur détient déjà, un mot de passe, ou rien.

Le mot de passe se demande là, part avec le brouillon, et `server-add-run.ts` crée la clé puis la pose dans le même geste ; un mot de passe refusé ne crée rien et revient au formulaire. `key-install.ts` essaie dans l'ordre : la machine s'ouvre déjà, ce que l'ordinateur détient déjà l'ouvre, puis le mot de passe du compte distant. Le mot de passe traverse le pont une fois, part par l'aide `SSH_ASKPASS` — jamais une ligne de commande, jamais un fichier — et est oublié. On ne rend la ligne `ssh-copy-id` à coller que quand l'app ne peut pas faire le travail.

## Le compte et l'installation

Le jeton bearer vit dans `safeStorage` et ne traverse jamais le pont. Le serveur est enrôlé auprès de la plateforme, puis le binaire de l'agent est téléchargé depuis elle, somme et signature vérifiées, avant d'être poussé. Sans compte, seul un build de développement installe.

Un build de développement parle à la console locale — `http://localhost:3000`, celle que `bun run dev:web` sert — et un build empaqueté à `app.pupitre.studio` ; `PUPITRE_PLATFORM_URL` désigne une autre plateforme. La sorte de build (`platform-url.ts`) suit la plateforme, pas le dossier : un build de développement dirigé vers une plateforme hébergée (`bun run dev:desktop:prod` depuis la racine) se conduit en production — droit d'usage du compte, agent de la release nommée, aucun préremplissage — dans un dossier de données à elle, `Pupitre Dev (<hôte>)`.

## Mettre l'agent à jour

Trois gestes, dans cet ordre : `agent.upgrade`, la fermeture du canal — le `serve` qui répond tient encore l'ancien binaire, remplacé par un `rename` — puis `agent.migrate`, et seulement ensuite `upgrade` sur les modules. Un serveur dont la configuration n'est pas la forme que son agent lit refuse tout le reste lui-même ; le bandeau le dit et n'offre que la migration.

## Les fichiers que l'app garde

`servers.json`, `account.json` et `transfers.json` passent par `store-migrations.ts` : une entrée numérotée par changement de forme, du JSON brut en entrée comme en sortie, une copie `<fichier>.r<révision>` avant le premier changement. Un fichier écrit par une version plus récente n'est jamais réécrit.

## Les transferts

Un fichier lourd ne passe pas par le canal de l'agent. `transfers-run.ts` lance un `rsync` par transfert sur la configuration SSH de l'app — donc sur la session maître, sans seconde authentification — avec `--partial --append-verify --info=progress2`, et `scp` quand `rsync` manque d'un côté, vérifié par `sha256`. Deux à la fois, les autres attendent ; une coupure réseau relance avec un délai croissant ; ce qui reste à faire est écrit dans `transfers.json` et repris au lancement. Le chemin distant est relatif à la racine de l'agent et validé par le main ; le chemin local vient d'une boîte de dialogue ou d'un dépôt, jamais d'une chaîne du renderer.

## L'onboarding

L'ordre est une machine, les écrans dessinent. `stores/onboarding-machine.ts` dit quelle étape suit quelle réponse et ce qu'entrer dans une étape déclenche ; le store exécute les effets. Aucun écran de l'onboarding n'agit dans un `useEffect`, et une étape ne se rejoint que par un événement qui la justifie.

## La trace en développement

`trace.ts` écrit ce que fait le processus principal — chaque `ssh`, chaque commande de l'agent, chaque phase d'un enrôlement — sur la sortie du processus principal et dans la console de la fenêtre. Rien dans un build empaqueté ; `PUPITRE_TRACE=1` l'allume ailleurs. Aucune valeur dont le nom sent le secret n'y est écrite.

## Arborescence

```
src/main/        le processus principal, un fichier par sujet — agent-client, servers, keys, key-install, ssh-config, host-keys, install, harden, projects, services, terminals, account, connections, platform-client, updater, trace… — et un `<sujet>-run.ts` à côté quand une opération longue a un déroulé à part
src/preload/     index.ts — la surface IPC, typée
src/renderer/src/
  components/ui/          Base UI + shadcn, un composant par fichier
  components/shell/       barre latérale et son volet des transferts, écrans de garde (premier lancement, aucun serveur, serveur restreint ou non prêt), frontière d'erreur
  components/onboarding/  le parcours : serveur · inspection · agent · config · durcissement · fin, et son rail
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
  components/files/       le navigateur de fichiers et l'éditeur basique : liste d'un dossier, fil d'Ariane, menu d'une entrée, aperçu, CodeMirror sur la palette ANSI du terminal
  components/updates/     bandeau et notes de mise à jour de l'agent, migration de sa configuration, mise à niveau des modules
  components/account/     connexion, identité, usage, abonnement
  components/settings/    apparence, connexions, terminal, notifications, démarrage, à propos (version, canal, mise à jour de l'app)
  components/help/        la vue « Aide » (bas de la barre latérale) : comment ssh, Claude Code, Codex et les éditeurs joignent le serveur piloté, avec ses valeurs lues du fichier SSH de l'app (`ssh-share:state`) et les modules du snapshot
  stores/                 un store Zustand par sujet : servers · snapshot · onboarding et onboarding-machine (l'ordre, pur) · install · harden · inspection · catalog · connections · services · project · project-add · files · transfers · terminals · shots · fleet · account · agent-update · app-update · preferences · reenroll · tunnel · channel · announcements · navigation · locale · theme
  lib/                    fonctions pures et hooks : format, duration, memory (navigation), completion, terminals, remedy, refusals, roles, use-pending, use-history-shortcuts…
  i18n/strings/           les textes, un fichier par sujet, `en` et `fr`
```

## Tests

`bun test` pour le main et les stores (agent factice qui rejoue des transcriptions dans `src/main/__tests__/fixtures/`, `stubPupitre` pour `window.pupitre`). Toute la suite tourne sous un document happy-dom enregistré par le preload (`src/renderer/src/__tests__/dom-register.ts`, avant React et Base UI, qui décident au chargement s'ils ont un navigateur ; le réseau et les horloges restent ceux de Bun) : un écran se lit d'ordinaire par `renderToStaticMarkup`, et ce qui flotte — dialogue, liste d'un `Select`, menu — se monte avec `mount` et se lit avec `optionsOf` (`__tests__/dom.tsx`), parce qu'un portail ne rend rien dans une chaîne. Playwright pour Electron dans `e2e/` : l'onboarding complet et la configuration contre le harnais de `e2e/harness/onboarding.ts`, captures des thèmes, et une passe axe sur chaque écran couvert (`e2e/harness/accessible.ts`). `src/main/__tests__/ipc-surface.test.ts` vérifie que chaque canal que le preload appelle est répondu par le main et par le harnais.

Les contrôles dessinés par l'app se pilotent par leur rôle : `getByRole("tab")` pour un onglet, `getByRole("switch")` pour une préférence, `getByRole("radio")` pour une carte de choix, `getByRole("alertdialog")` pour une confirmation, et `pickOption` / `toggle` de `e2e/harness/controls.ts` pour un `Select` et un interrupteur.

Les captures du tableau de bord ne sont comparées que sur macOS, où vivent leurs références (`e2e/references/*-darwin.png`) ; elles se régénèrent avec `bunx playwright test e2e/themes.spec.ts --update-snapshots` quand l'écran change exprès. Sur Linux, le scénario vérifie le thème sans image. La suite e2e ne montre jamais la fenêtre (`foreground.ts`, `discretion.spec.ts`).
