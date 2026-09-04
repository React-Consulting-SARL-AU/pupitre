# Plan — App desktop et agent serveur

Workspaces : `apps/desktop`, `apps/agent`, `packages/shared`. Préfixes `APP` et `AGT`. C'est le MVP : les lots 1 et 2 livrent une app complète que le propriétaire utilise tous les jours sur son propre VPS avec ses projets réels.

Contrats à lire : [agent-protocol.md](../contracts/agent-protocol.md), [service-catalog.md](../contracts/service-catalog.md), [DESIGN.md](../product/DESIGN.md), [security.md](../security.md). Spécification des modules : `server/bootstrap.sh`, `server/bin/dev`, [SETUP.md](../SETUP.md).

## Cible

```
apps/agent/
├── cmd/pupitred/main.go          serve, install, probe, upgrade, version
├── internal/protocol/            enveloppe JSON, dispatch, flux secret
├── internal/probe/               sonde
├── internal/modules/             un dossier par module, interface Module
│   ├── core/system, core/hardening
│   ├── runtime/node, runtime/java, runtime/python
│   ├── db/mysql, db/postgres, db/mongodb
│   ├── ai/claude, ai/codex, ai/hermes, ai/browser
│   ├── editor/jetbrains, editor/vscode, editor/zed
│   ├── exposure/cloudflare, exposure/ssh
│   └── tool/github, tool/onepassword
├── internal/registry/            projets, fichier projects.conf
├── internal/tmux/                sessions, fenêtres, logs
├── internal/platform/            client HTTPS : exchange, state, heartbeat, release
├── internal/entitlement/         droit d'usage, cache, mode restreint
├── internal/keys/                bloc balisé d'authorized_keys
├── internal/contract/schema.json généré depuis packages/shared
├── test/staging/                 tests d'intégration sur le VPS de staging
├── go.mod · package.json (wrapper turbo) · CLAUDE.md

apps/desktop/src/
├── main/                          ssh.ts (canal protocole), servers.ts, keys.ts, agent-client.ts, terminals.ts, account.ts, updater.ts
├── preload/                       surface IPC explicite
├── renderer/src/
│   ├── components/ui/             Base UI + shadcn, tokens de packages/design
│   ├── components/onboarding/     add-server, inspection, catalog, configure, install, harden, first-project
│   ├── components/dashboard, projects, terminals, agents, services, settings, account
│   ├── stores/                    zustand : servers, snapshot, onboarding, theme, account
│   └── lib/
├── shared/                        types locaux à l'app (le contrat vient de @pupitre/shared)
└── CLAUDE.md
```

## Lot 1 — L'agent et les modules

### AGT-01 — Squelette, protocole, `hello` et `ping`
Lot 1 · dépend de INF-03, INF-04 · `apps/agent`

But. `pupitred serve` lit des requêtes JSON par ligne et répond selon le protocole.
Périmètre. `internal/protocol` : enveloppe, `id`, dispatch par `cmd`, événements, erreurs `{ code, message, fix }`, flux secret sur un descripteur dédié, négociation `hello` avec `protocol` et `capabilities`. `cmd/pupitred` : sous-commandes `serve`, `version`. Validation des paramètres contre `internal/contract/schema.json`.
Hors périmètre. Toute commande métier.
Critères d'acceptation.
0. Les codes d'erreur sont ceux de `@pupitre/shared/agent-protocol/errors` : le squelette d'INF-03 émet `invalid_request`, à remplacer par `bad_request`. `go.mod` passe à `go 1.26` et la CI revient à garble `@latest`.
1. `hello` avant toute commande ; sinon `hello_required`.
2. Un `protocol` inconnu renvoie `protocol_mismatch` avec la version attendue.
3. Une requête malformée renvoie `bad_request` sans tuer le processus.
Tests. `go test ./internal/protocol` avec des transcriptions requête/réponse en fixtures.

### AGT-02 — Sonde sh et sonde Go
Lot 1 · dépend de AGT-01 · `apps/agent`

But. Décrire une machine avant et après l'installation.
Périmètre. `internal/probe/probe.sh` en sh POSIX, exécuté en mémoire par `ssh host 'sh -s' < probe.sh`, qui écrit un JSON conforme au schéma `Probe` sans jq ; `internal/probe` en Go avec le même schéma, exposé par la commande `probe`. Verdict : `bare`, `managed` (version, à jour ou non), `occupied` (Docker, panneau, ports 80 et 443, utilisateurs existants), `incompatible` (distribution, architecture, RAM sous 4 Go, pas de sudo), avec `reasons[]` et `fixes[]`.
Critères d'acceptation.
1. Sur un Ubuntu 24.04 nu : `bare`. Sur un Ubuntu avec Docker et un site sur 80 : `occupied` avec la liste. Sur Debian 12 : `incompatible` avec la raison.
2. Les deux sondes produisent le même JSON sur la même machine.
Tests. `test/staging/probe_test.go` contre le staging réinstallé ; tests unitaires du parsing de `/etc/os-release`, `free`, `df`, `ss`.

### AGT-03 — Moteur de modules et rapport
Lot 1 · dépend de AGT-01 · `apps/agent`

But. Le cadre dans lequel chaque module s'écrit.
Périmètre. Interface `Module` (`Manifest`, `Check`, `Install`, `Configure`, `Upgrade`, `Uninstall`, `Status`), résolution des dépendances et conflits, ordre topologique, exécution avec événements `step`, comptabilité `failed[]` et `warned[]`, commande de rejeu par module, rapport JSON persistant dans `/var/lib/pupitre/report.json`, journal dans `/var/log/pupitre.log`, verrou apt (`DPkg::Lock::Timeout=600`), `catalog` et `report`. Helpers : `apt.Install`, `systemd.Enable`, `file.WriteAtomic`, `user.Run`.
Critères d'acceptation.
1. Un module en échec n'empêche pas les suivants ; le rapport le liste avec sa commande de rejeu.
2. Rejouer `install` sur une machine déjà installée ne change rien et se termine en moins de 30 secondes.
3. Un module sans droit d'usage valide refuse de s'exécuter (`entitlement_required`), sauf en build de développement.
Tests. Modules factices en test unitaire : ordre, échec partiel, rejeu.

### AGT-04 — Modules socle et durcissement
Lot 1 · dépend de AGT-03 · `apps/agent`

Périmètre. `core.system` et `core.hardening` d'après le catalogue et `server/bootstrap.sh` phases `system`, `user`, `harden`. Le moteur ordonne les modules par dépendances puis par catégorie, donc `core.*` en premier : la fermeture de root ne passe pas par l'ordre d'installation mais par la commande `harden`, appelée par l'app en dernier ; `core.hardening.Install` pose ufw et fail2ban sans toucher à sshd. Commande `harden` qui refuse de fermer root si aucune clé n'ouvre `dev`. Marqueurs OSC 133 dans `.zshrc` de `dev` (`server/bin/pupitre.zsh` comme spécification).
Critères d'acceptation.
1. Après `install core.*` sur le staging, `ssh dev@staging true` avec la clé fonctionne et `ssh root@staging` est refusé.
2. `harden` sans clé sur `dev` renvoie `root_closed: false` avec la raison, et root reste ouvert.
3. `sudo -n true` fonctionne pour `dev`.
Tests. `test/staging/core_test.go`.

### AGT-05 — Modules runtimes
Lot 1 · dépend de AGT-03 · `apps/agent`

Périmètre. `runtime.node`, `runtime.java`, `runtime.python` via mise, activés pour les shells non interactifs par un bloc balisé par module dans le `.zshenv` de `dev` — `.zshrc` n'est pas lu par `ssh host 'node -v'` et reste au socle pour les marqueurs OSC 133. Daemon Gradle dimensionné.
Critères d'acceptation. Sur le staging, `ssh dev@staging 'node -v && bun -v && java -version && uv --version'` renvoie les versions choisies.
Tests. `test/staging/runtime_test.go`.

### AGT-06 — Modules bases de données
Lot 1 · dépend de AGT-03 · `apps/agent`

Périmètre. `db.mysql` (MySQL 8 ou MariaDB), `db.postgres`, `db.mongodb` d'après le catalogue et `server/bootstrap.sh` phase `database` : liaison locale, comptes applicatif et distant, dimensionnement, import des dumps déposés dans `~/dumps/`, commandes `db.dump`, `db.import`, `db.shell`, `db.url`. Mots de passe générés, écrits dans `/etc/pupitre/env`, jamais dans le rapport.
Critères d'acceptation.
1. Chaque base n'écoute que sur `127.0.0.1` (`ss -ltn`).
2. Un dump déposé avant l'installation est importé, et le rapport le dit.
3. `db.url` renvoie une URL de connexion utilisable à travers `ssh -L`.
Tests. `test/staging/db_test.go` par moteur.

### AGT-07 — Modules agents IA et navigateur
Lot 1 · dépend de AGT-05 · `apps/agent`

Périmètre. `ai.claude`, `ai.codex`, `ai.hermes` (Hermes Agent de Nous Research, via Python, fournisseurs en secrets, service systemd optionnel), `ai.browser` (Chrome headless, dépendances Playwright, commande `shot` et galerie d'après `server/bin/shot.in` et `dev-shots-server`). Skills Pupitre déposés dans le dossier attendu par chaque agent (`server/agents/` comme spécification). Commande `agent.open`.
Critères d'acceptation.
1. `claude --version`, `codex --version`, `hermes --version` répondent pour `dev`.
2. `shot https://example.org` produit une image visible par `shots.list`.
Tests. `test/staging/ai_test.go`.

### AGT-08 — Modules éditeurs distants
Lot 1 · dépend de AGT-05 · `apps/agent`

Périmètre. `editor.jetbrains` (backend dans `~/.cache/JetBrains/RemoteDev/dist/`, JVM dimensionnée), `editor.vscode` (CLI `code`, serveur distant préinstallé pour la version courante, extensions, Remote Tunnel optionnel), `editor.zed` (serveur distant pour la version donnée).
Critères d'acceptation.
1. La première connexion Remote SSH de VS Code sur le staging n'installe rien (moins de 5 secondes).
2. JetBrains Gateway trouve le backend sans téléchargement.
Tests. Vérification de la présence et de l'exécutabilité des binaires ; test manuel documenté pour la connexion effective.

### AGT-09 — Modules exposition et outils
Lot 1 · dépend de AGT-03 · `apps/agent`

Périmètre. `exposure.cloudflare` (tunnel, routes, DNS, d'après la phase `tunnel`), `exposure.ssh`, `tool.github`, `tool.1password` (d'après la phase `secrets`), commandes `tunnel.*`, `secrets.*`, `project.env`.
Critères d'acceptation.
1. Sans jeton Cloudflare, `exposure.cloudflare` est refusé à la configuration, pas à l'installation.
2. Un projet avec sous-domaine obtient une route et un enregistrement DNS ; sans tunnel, la colonne est ignorée.
Tests. `test/staging/exposure_test.go` avec une zone de test.

### AGT-10 — Registre des projets et pilotage
Lot 1 · dépend de AGT-04 · `apps/agent`

Périmètre. `internal/registry` (format de `server/projects.conf`, fichier local prioritaire), `internal/tmux` (une session `dev`, une fenêtre par projet, logs par projet), commandes `project.*` sauf git, `snapshot`, `status`, `service.status`. Détection du gestionnaire de paquets, commande d'installation dérivée.
Critères d'acceptation.
1. `project.add` puis `project.up` d'un projet Vite : `snapshot` le montre `online` avec son port en moins de 30 secondes ; `project.logs` renvoie la sortie ; `project.down` l'arrête.
2. `snapshot` répond en moins de 300 ms avec dix projets.
Tests. `test/staging/projects_test.go` avec un dépôt de fixture.

### AGT-11 — Sessions, processus, captures, git
Lot 1 · dépend de AGT-10 · `apps/agent`

Périmètre. `sessions.*`, `processes.*`, `process.kill`, `shots.*`, `project.branches`, `project.checkout`, `project.git_status`, `project.working_tree`, `project.diff`, `project.sync`, `project.install`, `reboot`, `doctor`, `diag`.
Critères d'acceptation.
1. `project.git_status` distingue `behind`, `ahead`, `dirty` et renseigne `problem` quand le dépôt distant est inaccessible.
2. `project.diff` renvoie le patch brut de git, non interprété.
Tests. Dépôt de fixture avec commits locaux et distants simulés.

### AGT-12 — Shell de l'app et autocomplétion
Lot 1 · dépend de AGT-10 · `apps/agent`

Périmètre. `completions` (grammaire des commandes, projets, chemins), marqueurs OSC 133, sous-commande `pupitred dev` qui expose les commandes de pilotage à un humain dans un terminal (`pupitred dev up api`), pour que `ssh serveur pupitred dev status` marche toujours.
Critères d'acceptation. `pupitred dev` couvre `up`, `down`, `restart`, `status`, `logs`, `sync`, `attach`, `branch`, `db`, `doctor`.

### AGT-13 — Mise à jour de l'agent
Lot 1 · dépend de AGT-03 · `apps/agent`

Périmètre. `agent.upgrade` : téléchargement depuis l'URL fournie, vérification SHA-256 et signature Ed25519 (clé publique embarquée), remplacement atomique, redémarrage de l'unité, `upgrade` des modules dont le manifeste a changé.
Critères d'acceptation.
1. Une signature invalide laisse l'ancien binaire en place et renvoie `bad_signature`.
2. Après mise à jour, `hello` renvoie la nouvelle version sans perdre la session tmux.

### AGT-14 — Droit d'usage, enrôlement, heartbeat
Lot 3 · dépend de AGT-03, PLT-05 · `apps/agent`

Périmètre. `internal/platform` et `internal/entitlement` : échange du jeton d'enrôlement, jeton de serveur en `/etc/pupitre/server.token`, lecture de `/agent/state` toutes les 30 secondes, bloc balisé d'`authorized_keys`, heartbeat toutes les 5 minutes, cache du droit d'usage, mode restreint après sept jours, `keys.*`. Build de développement avec droit d'usage intégré (`-tags dev`).
Critères d'acceptation.
1. Une clé ajoutée dans la console ouvre le serveur en moins d'une minute ; retirée, elle ne l'ouvre plus en moins d'une minute.
2. Plateforme injoignable pendant 6 jours : tout fonctionne. Au huitième : `hello` renvoie `restricted`, `install` renvoie `entitlement_required`, tmux et les projets tournent toujours.
3. Le binaire copié sur un autre serveur sans jeton ne répond qu'à `hello`, `ping`, `diag`.
Tests. Serveur de plateforme factice en test ; scénario de coupure sur le staging avec horloge simulée.

### AGT-15 — Obfuscation et distribution
Lot 3 · dépend de AGT-14, INF-05 · `apps/agent`, `.github`

Périmètre. Build de release avec `-trimpath -ldflags="-s -w"` et garble, signature Ed25519 des binaires, publication sur R2 via `POST /admin/releases`, canal `stable` et `beta`.
Critères d'acceptation.
1. `strings pupitred | grep -c pupitre` est proche de zéro sur le build de release.
2. Un binaire publié est téléchargeable par l'app avec un jeton d'appareil et pas sans.

### AGT-16 — Validateur : messages d'erreur déterministes
Lot 1 · dépend de AGT-01 · `apps/agent/internal/contract`

But. Le message renvoyé pour une valeur rejetée par un `oneOf` discriminé est toujours le même.
Périmètre. Dans `validate.go`, choisir la branche dont le discriminateur `const` correspond avant de départager par longueur de chemin, et itérer les propriétés dans l'ordre du schéma plutôt que celui d'une map. Tests qui fixent le message attendu pour `Field` (`boolean` avec `default: "yes"` → `/default : doit être un booléen`).
Hors périmètre. Nouveaux mots-clés JSON Schema.
Critères d'acceptation.
1. `go test -count=20 ./internal/contract` passe avec des assertions sur le message, pas seulement sur accepte/rejette.

## Lot 2 — L'app

### APP-01 — Design monochrome et thèmes
Lot 2 · dépend de INF-03 · `apps/desktop`, `packages/design`

But. L'app adopte [DESIGN.md](../product/DESIGN.md).
Périmètre. `packages/design` (tokens CSS clair et sombre, preset Tailwind 4, palette ANSI), remplacement de la palette chaude et de l'accent orange dans `styles.css` et `lib/terminals.ts`, réglage de thème (`system`, `light`, `dark`) dans les préférences, composants `ui/` migrés vers Base UI + shadcn avec la prop `render`, points d'état par la forme.
Critères d'acceptation.
1. `grep -rE "#[0-9a-f]{6}|hsl\(|rgb\(" apps/desktop/src/renderer --include=*.tsx` ne renvoie rien.
2. Le thème bascule sans rechargement, terminal compris.
3. Chaque état de projet est distinguable en niveaux de gris purs.
Tests. Capture des trois thèmes par Playwright pour Electron, comparée à une référence.

### APP-02 — Client du protocole agent sur SSH
Lot 2 · dépend de AGT-01 · `apps/desktop`

Périmètre. `main/agent-client.ts` : un canal SSH par serveur lançant `pupitred serve`, requêtes sérialisées, événements, flux secret, reconnexion avec backoff, second canal pour les commandes longues, timeouts par commande, `hello` au démarrage, types importés de `@pupitre/shared`. Remplacement de l'ancien canal `sh` à marqueurs.
Critères d'acceptation.
1. Cent `snapshot` consécutifs sans fuite de processus ni désynchronisation d'`id`.
2. Une coupure réseau pendant `install` reprend le flux d'événements sans perdre l'état (rapport relu au retour).
Tests. Agent factice en Bun qui rejoue des transcriptions.

### APP-03 — Serveurs, clés par appareil, config SSH propre à l'app
Lot 2 · dépend de APP-02 · `apps/desktop`

Périmètre. Écran « Ajouter un serveur » : adresse, port, utilisateur ; clé générée (`ssh-keygen -t ed25519` dans `userData/keys/`, 0600), importée, ou hôte existant de `~/.ssh/config`. Fichier `userData/ssh/config` passé avec `-F`, `IdentitiesOnly yes`, clé d'hôte épinglée (`UserKnownHostsFile` propre à l'app). Affichage de la clé publique et de la commande `ssh-copy-id`. Liste des serveurs, serveur actif, suppression.
Hors périmètre. Le compte et les serveurs distants.
Critères d'acceptation.
1. `~/.ssh/config` de l'utilisateur n'est jamais modifié (test qui hache le fichier avant et après).
2. Un changement de clé d'hôte bloque la connexion avec une explication et un bouton « J'ai réinstallé ce serveur ».

### APP-04 — Écran d'inspection
Lot 2 · dépend de APP-03, AGT-02 · `apps/desktop`

Périmètre. Envoi de `probe.sh` en mémoire, rendu du verdict : `bare`, `managed` (version, mise à jour), `occupied` (ce qui serait touché), `incompatible` (raison, remède). Boutons selon le verdict : « Installer », « Mettre à jour », « Installer quand même », « Choisir un autre serveur ».
Critères d'acceptation. Les quatre verdicts ont un écran, avec la liste des raisons et des remèdes tels que renvoyés.

### APP-05 — Catalogue et configuration des services
Lot 2 · dépend de APP-04, AGT-03 · `apps/desktop`

Périmètre. Catalogue dérivé de `catalog` (jamais une liste en dur) : catégories, cartes, préréglages, dépendances et conflits appliqués, ressources cumulées comparées à la sonde, modules incompatibles grisés avec la raison. Écran de configuration généré des `fields` : texte, nombre, select, version, secret (généré par défaut, révélable une fois). Champs communs : nom, identité git, fuseau, dossier des projets.
Critères d'acceptation.
1. Cocher `db.postgres` sur une machine de 4 Go avec `editor.jetbrains` déjà coché affiche l'avertissement de RAM cumulée.
2. Un module ajouté dans l'agent apparaît dans l'app sans rebuild.
3. Aucun secret n'est journalisé ni conservé dans un store après l'installation.

### APP-06 — Installation en direct et rapport
Lot 2 · dépend de APP-05 · `apps/desktop`

Périmètre. Envoi de `pupitred` (binaire embarqué dans `extraResources`, architecture de la sonde, somme vérifiée) par le canal SSH, `install` avec le flux secret, écran de progression : modules, étapes, durées, compteur, journal repliable ; rapport final avec `failed[]`, `warned[]`, bouton « Rejouer » par module, « Continuer » malgré un échec non bloquant.
Critères d'acceptation.
1. Sur le staging, un préréglage `web-js` s'installe de bout en bout depuis l'app en moins de 20 minutes, sans terminal.
2. Un module en échec forcé (dépôt apt injoignable) apparaît en échec, le reste continue, et « Rejouer » le répare une fois le dépôt rétabli.

### APP-07 — Durcissement et bascule root → dev
Lot 2 · dépend de APP-06, AGT-04 · `apps/desktop`

Périmètre. Après l'installation : `harden`, puis réécriture de la config SSH de l'app en `User dev` et reconnexion ; si `root_closed: false`, écran qui explique et garde root.
Critères d'acceptation. Depuis un serveur atteint en root, l'app termine connectée en `dev`, root fermé, sans intervention.

### APP-08 — Premier projet
Lot 2 · dépend de APP-07, AGT-10 · `apps/desktop`

Périmètre. Formulaire projet existant adapté au protocole : URL git ou dossier, gestionnaire détecté, commande proposée, port libre attribué, sous-domaine si `exposure.cloudflare`. `project.add`, `project.install`, `project.up`, ouverture des logs.
Critères d'acceptation. Un dépôt Vite public passe de l'URL à `online` avec ses logs dans l'app en moins de 90 secondes.

### APP-09 — Tableau de bord et projets sur le nouveau protocole
Lot 2 · dépend de APP-08, AGT-11 · `apps/desktop`

Périmètre. Migration de `Dashboard`, `Projects`, `ProjectView`, `ProjectForm`, `Repos`, `DiffView`, `Processes`, `Sessions`, `Secrets`, `LogPanel` vers `agent-client`. Ouverture dans l'éditeur distant installé (JetBrains Gateway, VS Code, Cursor, Zed) d'après les modules présents. Suppression de tout appel à l'ancienne commande `dev`.
Critères d'acceptation.
1. `grep -r "dev snapshot\|dev projects" apps/desktop/src` ne renvoie rien.
2. Chaque écran existant fonctionne à l'identique sur le staging.

### APP-10 — Terminaux, agents, galerie
Lot 2 · dépend de APP-09, AGT-12 · `apps/desktop`

Périmètre. Terminaux node-pty sur `ssh -F`, autocomplétion depuis `completions` et OSC 133, onglets Claude, Codex, Hermes via `agent.open`, galerie des captures, sessions qui traînent.
Critères d'acceptation. La connexion de Claude Code par URL se fait dans l'onglet sans quitter l'app ; l'autocomplétion propose les projets de `snapshot`.

### APP-11 — Services au quotidien
Lot 2 · dépend de APP-09, AGT-06 · `apps/desktop`

Périmètre. Écran Services : état, version, port, identifiants masqués révélables, ajouter ou retirer un module après coup (`install`, `uninstall`), shell sur une base, export et import, tunnel.
Critères d'acceptation. Ajouter `db.mongodb` sur un serveur déjà installé passe par le même écran de configuration et le même rapport que l'onboarding.

### APP-12 — Mise à jour de l'agent depuis l'app
Lot 2 · dépend de APP-09, AGT-13 · `apps/desktop`

Périmètre. Comparaison version embarquée contre `hello`, bandeau « Mise à jour disponible » avec les notes, `agent.upgrade` par le canal, `upgrade` des modules.
Critères d'acceptation. Une app plus récente met l'agent à jour en un clic ; une app plus ancienne qu'un agent affiche « Mettez l'app à jour » et reste fonctionnelle sur les commandes compatibles.

### APP-13 — Build macOS signé, notarisé, bytecode, auto-update
Lot 2 · dépend de APP-01, INF-05 · `apps/desktop`, `.github`

Périmètre. Plugin bytecode d'electron-vite sur main et preload, asar avec intégrité, signature avec le compte Apple existant, notarisation, electron-updater sur GitHub Releases privées (jeton d'accès), workflow de release par tag.
Critères d'acceptation.
1. Le `.dmg` s'ouvre sur un Mac vierge sans avertissement Gatekeeper.
2. Une release suivante est proposée et installée par l'app.

**Porte du MVP** : le propriétaire migre ses projets réels sur un VPS neuf par l'app, sans terminal, et travaille dessus une semaine. Chaque irritation devient un critère d'une tâche suivante.

## Lot 3 — Compte et serveurs distants

### APP-14 — Compte : device flow, appareils, enrôlement
Lot 3 · dépend de APP-13, PLT-02, PLT-04, PLT-05 · `apps/desktop`

Périmètre. « Se connecter » : `deviceAuthorization` (code affiché, navigateur ouvert, sondage), jeton bearer via `safeStorage`, `POST /me/devices` avec la clé de l'appareil, `/servers/enroll` intégré à l'onboarding (avant l'envoi du binaire : le binaire vient de la plateforme, plus de `extraResources`), vérification du droit d'usage au lancement avec tolérance de sept jours, déconnexion. Sans compte : mode développement uniquement en build de dev.
Critères d'acceptation.
1. Un serveur enrôlé apparaît dans la console en moins d'une minute avec son heartbeat.
2. Le build de production refuse d'installer sans compte, avec le lien vers la console.

### APP-15 — Serveurs distants et organisations
Lot 3 · dépend de APP-14, PLT-10 · `apps/desktop`

Périmètre. `GET /me/servers` fusionné à la liste locale, sélecteur d'organisation, première ouverture d'un serveur attribué (attente de `key_ready`, puis assistant de personnalisation), révocation vue côté app.
Critères d'acceptation. Un membre invité voit son serveur attribué et s'y connecte sans saisir d'adresse ni de clé.

### APP-16 — Builds Windows et Linux
Lot 4 · dépend de APP-13 · `apps/desktop`, `.github`

Périmètre. Signature Windows via Azure Trusted Signing, OpenSSH de Windows sans `ControlMaster`, node-pty avec ConPTY, chemins de clés, AppImage et `.deb`, tests du parcours d'onboarding sur les trois OS.
Critères d'acceptation. Le parcours APP-03 à APP-08 passe sur Windows 11 et Ubuntu 24.04 desktop.
