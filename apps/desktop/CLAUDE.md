# apps/desktop — Guidelines

L'app Electron. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · protocole → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · migrations → [`docs/contracts/config-migrations.md`](../../docs/contracts/config-migrations.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

> Le style est enforced par Ultracite (Biome). Ce fichier ne contient que ce que le linter ne dérive pas.

## Stack imposée

Electron 44 · electron-vite (bytecode sur le main seul : le V8 du renderer refuse le cache produit par l'isolat Node, le preload reste du JavaScript) · React 19 · Tailwind 4 sur les tokens de `@pupitre/design` · Base UI + shadcn/ui, prop `render`, jamais `asChild` · Zustand pour l'état client · xterm + node-pty · `ssh` du système, jamais une bibliothèque SSH en JavaScript · Lucide uniquement.

**Banned** : `@radix-ui/*`, `ssh2`, `node-ssh`, `axios`, toute couleur en dur.

## Principes

- **L'app est un client de l'agent.** Elle affiche ce que `snapshot` renvoie et n'a pas de second modèle. Une information nouvelle apparaît dans l'agent d'abord.
- **Le renderer ne touche pas au système.** `contextIsolation` on, `nodeIntegration` off, surface explicite dans `src/preload`. Le renderer nomme un projet et une action ; le main valide le nom contre la liste que l'agent vient de donner avant d'en faire une commande.
- **Quatre canaux par serveur.** `src/main/agent-client.ts` tient une session SSH qui lance `pupitred serve` ; requêtes sérialisées, `id` croissant. Le canal de contrôle porte les gestes ; celui de travail les commandes longues et les lectures bornées (`install`, `fs.read`, `shots.read`) ; celui du battement les lectures qu'un écran fait sur minuterie (`agentPoll` : `snapshot`, `processes.list`), pour qu'un clic n'attende jamais derrière la lecture du tableau de bord ; celui des suivis les journaux suivis (`project.logs`, `service.logs`), qui tiennent leur canal tant que le lecteur reste — le panneau d'un service montre son journal à côté du formulaire, et l'`install` qui applique le formulaire ne doit pas attendre que le lecteur ferme le panneau. Jamais de `ssh` par appel. Un canal qui tombe pendant `install`, `upgrade` ou `harden` se rouvre aussi longtemps que la commande avait de temps, et le rapport de l'agent — écrit avant chaque étape — se relit jusqu'à `finished_at` ; un canal que l'app a fermé elle-même ne se rouvre pas.
- **La config SSH est celle de l'app** : `userData/ssh/config` passé avec `-F`, clés dans `userData/keys/` en 0600, clé d'hôte épinglée. `~/.ssh/config` de l'utilisateur n'est jamais réécrit : sur un geste explicite (Réglages › SSH, ou un bouton « Ouvrir dans » qui la demande d'abord), `ssh-share.ts` y pose une seule ligne `Include` vers le fichier de l'app, en tête, et la retire de même. Chaque bloc de l'app porte `pupitre-<id>` et, quand aucun hôte du système ne le prend, le nom du serveur (`ssh atelier`) ; les liens des éditeurs nomment ce mot. Un hôte existant peut être désigné.
- **L'app pose sa clé elle-même.** Le formulaire d'ajout frappe avant de créer quoi que ce soit (`knock.ts`) : l'adresse parle-t-elle SSH, et qu'est-ce qui ouvre le compte — ce que l'ordinateur détient déjà, un mot de passe, ou rien. Le mot de passe se demande là, part avec le brouillon, et `server-add-run.ts` crée la clé puis la pose dans le même geste ; un mot de passe refusé ne crée rien et revient au formulaire. `key-install.ts` essaie dans l'ordre : la machine s'ouvre déjà, ce que l'ordinateur détient déjà l'ouvre, puis le mot de passe du compte distant. Le mot de passe traverse le pont une fois, part par l'aide `SSH_ASKPASS` — jamais une ligne de commande, jamais un fichier — et est oublié. On ne rend la ligne `ssh-copy-id` à coller que quand l'app ne peut pas faire le travail.
- **En développement, tout se trace.** `trace.ts` écrit ce que fait le processus principal — chaque `ssh`, chaque commande de l'agent, chaque phase d'un enrôlement — sur la sortie du processus principal et dans la console de la fenêtre. Rien dans un build empaqueté ; `PUPITRE_TRACE=1` l'allume ailleurs. Aucune valeur dont le nom sent le secret n'y est écrite.
- **Aucun secret dans un store, un log ou une commande.** Les secrets partent par le flux secret du protocole et sont oubliés.
- **Le compte décide de l'installation.** Le jeton bearer vit dans `safeStorage` et ne traverse jamais le pont ; le serveur est enrôlé auprès de la plateforme, puis le binaire de l'agent est téléchargé depuis elle, somme et signature vérifiées, avant d'être poussé. Sans compte, seul un build de développement installe. Un build de développement parle à la console locale — `http://localhost:3000`, celle que `bun run dev:web` sert — et un build empaqueté à `app.pupitre.studio` ; `PUPITRE_PLATFORM_URL` désigne une autre plateforme. La sorte de build (`platform-url.ts`) suit la plateforme, pas le dossier : un build de développement dirigé vers une plateforme hébergée (`bun run dev:desktop:prod` depuis la racine) se conduit en production — droit d'usage du compte, agent de la release nommée, aucun préremplissage — dans un dossier de données à elle, `Pupitre Dev (<hôte>)`.
- **Mettre l'agent à jour, c'est trois gestes dans cet ordre** : `agent.upgrade`, la fermeture du canal — le `serve` qui répond tient encore l'ancien binaire, remplacé par un `rename` — puis `agent.migrate`, et seulement ensuite `upgrade` sur les modules. Un serveur dont la configuration n'est pas la forme que son agent lit refuse tout le reste lui-même ; le bandeau le dit et n'offre que la migration.
- **Un fichier que l'app garde porte sa révision.** `servers.json`, `account.json` et `transfers.json` passent par `store-migrations.ts` : une entrée numérotée par changement de forme, du JSON brut en entrée comme en sortie, une copie `<fichier>.r<révision>` avant le premier changement. Un fichier écrit par une version plus récente n'est jamais réécrit.
- **Chaque attente dit ce qui se passe, chaque erreur dit le remède.** Le `fix` renvoyé par l'agent est affiché tel quel.
- **L'ordre de l'onboarding est une machine, les écrans dessinent.** `stores/onboarding-machine.ts` dit quelle étape suit quelle réponse et ce qu'entrer dans une étape déclenche ; le store exécute les effets. Aucun écran n'agit dans un `useEffect`, et une étape ne se rejoint que par un événement qui la justifie.
- **Un fichier lourd ne passe pas par le canal de l'agent.** `transfers-run.ts` lance un `rsync` par transfert sur la configuration SSH de l'app — donc sur la session maître, sans seconde authentification — avec `--partial --append-verify --info=progress2`, et `scp` quand `rsync` manque d'un côté, vérifié par `sha256`. Deux à la fois, les autres attendent ; une coupure réseau relance avec un délai croissant ; ce qui reste à faire est écrit dans `transfers.json` et repris au lancement. Le chemin distant est relatif à la racine de l'agent et validé par le main ; le chemin local vient d'une boîte de dialogue ou d'un dépôt, jamais d'une chaîne du renderer.
- **Chaque geste répond là où il a été fait** et **l'accessibilité est une exigence**, toutes deux spécifiées dans [DESIGN.md](../../docs/product/DESIGN.md). Un bouton qui déclenche un travail passe en `loading` — `Button`, `IconButton` et `ConfirmButton` le font seuls dès que le gestionnaire rend la promesse du travail (`usePending`), donc un gestionnaire asynchrone retourne toujours sa promesse ; un champ refusé porte sa phrase, `aria-invalid` et `aria-describedby`.

## Architecture

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
  stores/                 un store Zustand par sujet : servers · snapshot · onboarding et onboarding-machine (l'ordre, pur) · install · harden · inspection · catalog · connections · services · project · project-add · files · transfers · terminals · shots · fleet · account · agent-update · app-update · preferences · reenroll · tunnel · channel · announcements · navigation · locale · theme
  lib/                    fonctions pures et hooks : format, duration, memory (navigation), completion, terminals, remedy, refusals, roles, use-pending, use-history-shortcuts…
```

Fichiers `{feature}-{context}-{type}.tsx`. Hors `components/ui/`, un composant React par fichier. Pas de barrel files.

## Tests

`bun test` pour le main et les stores (agent factice qui rejoue des transcriptions dans `src/main/__tests__/fixtures/`), Playwright pour Electron dans `e2e/` : l'onboarding complet et la configuration contre le harnais de `e2e/harness/onboarding.ts`, captures des thèmes, et une passe axe sur chaque écran couvert (`e2e/harness/accessible.ts`). Assertions dans `it()`, `async/await`, pas de `.only` committé. Les captures du tableau de bord ne sont comparées que sur macOS, où vivent leurs références (`e2e/references/*-darwin.png`) ; elles se régénèrent avec `bunx playwright test e2e/themes.spec.ts --update-snapshots` quand l'écran change exprès. Sur Linux, le scénario vérifie le thème sans image.

## Commandes

```bash
bun run dev:web        # depuis la racine : la console que l'app appelle en développement
bun run dev
bun run dev:desktop:prod  # depuis la racine : la même app, sur app.pupitre.studio
bun run build          # typecheck + bundle
bun run build:mac
bun run test
bun run test:e2e
```
