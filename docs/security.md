# Sécurité

## Ce qu'on ne contourne pas

Un client est root sur son serveur : il peut copier tout fichier qui s'y trouve, y compris un binaire. Aucune technique ne l'en empêche. Ce qu'on fait, c'est rendre la copie **inutile** (le binaire ne fait rien sans un droit d'usage valide, et la valeur est dans l'app et la plateforme), **coûteuse** à lire (compilé, dépouillé, obfusqué), et **interdite** (contrat de licence). C'est le modèle de tous les agents commerciaux installés chez le client.

## Où vivent les secrets

| Secret | Où | Qui le voit |
| --- | --- | --- |
| Clé privée SSH d'un appareil | dossier de données de l'app, `keys/<serveur>` en 0600 | l'utilisateur, sur cet appareil. Jamais l'API, jamais la console, jamais un email |
| Jeton de session desktop (bearer) | `safeStorage` : trousseau macOS, DPAPI Windows, libsecret Linux | l'app |
| Jeton d'enrôlement | mémoire de l'app, une fois, à l'installation ; remis à l'agent par la commande `enroll` du protocole, sur le flux secret | l'app, puis l'agent qui l'échange |
| Jeton de serveur | `/etc/pupitre/server.token`, 0600 root ; haché en base | l'agent. Ne donne accès qu'à l'état de son propre serveur. Rotation à chaque réinstallation |
| Adresse de la plateforme | `/etc/pupitre/platform.url`, 0644 root | l'agent. Ce n'est pas un secret : c'est la console que ce serveur a acceptée à l'enrôlement, et celle à laquelle il répond seul |
| Jetons Stripe et R2 | secrets Wrangler, un jeu par environnement | l'API. La base n'a pas de jeton : c'est une D1 liée au Worker, que rien d'autre n'atteint |
| Clé de signature des binaires, clé R2 en écriture, certificat Developer ID et clé de notarisation Apple | la note 1Password de la release, recopiée en secrets du dépôt GitHub par `release secrets` ; les runners de `release.yml` les reçoivent dans leur environnement le temps d'une release, jamais dans un fichier | la chaîne de release. GitHub est le seul poste qui signe : un dépôt compromis signe une release, et c'est le coût accepté d'une chaîne hébergée |
| Jeton de publication (`PUPITRE_PUBLISH_TOKEN`) | secret Wrangler des deux environnements, et la même note 1Password | la chaîne de release. Il n'ouvre que les routes de version : ni un client, ni une organisation, ni un serveur |
| Secrets du client (mots de passe de bases, jetons Cloudflare, 1Password) | `/etc/pupitre/env`, 0600, sur son serveur ; les jetons qu'un CLI lit dans son environnement (Neon, 1Password, Wrangler, Vercel, Supabase, Stripe) aussi dans `/home/dev/.config/pupitre/env`, 0600 `dev` | lui seul. Ils ne remontent jamais |
| Phrase de passe des sauvegardes | nulle part : tapée sur le poste, dérivée (PBKDF2-SHA256, 600 000 tours) en une clé X25519, puis oubliée | personne. Perdue, elle rend les sauvegardes illisibles ; l'app le dit en la faisant choisir |
| Clé privée des sauvegardes | mémoire de l'app le temps d'une restauration, puis ligne de secrets de `backup.restore.setup` et `backup.restore.data` ; l'agent s'en sert en mémoire | l'agent, le temps de la commande. Jamais écrite, jamais journalisée, jamais dans `params` |
| Clé publique et sel des sauvegardes | la connexion `backup` de l'app, `install.json` (`recipient`, `kdf_salt`), chaque manifeste, la plateforme | tout le monde : ce ne sont pas des secrets. Le serveur chiffre pour cette clé et ne peut pas déchiffrer |
| Clé S3 du seau des sauvegardes | trousseau de l'app (connexion `backup`) ; `install.json` du serveur (`core.backup`, la clé secrète parmi les secrets) ; la ligne de secrets d'une restauration | l'app et root sur le serveur. Jamais la plateforme, jamais une ligne de commande, jamais le journal |
| Configuration gardée pendant une restauration | `/var/lib/pupitre/restore/before/`, 0700 root, de `backup.restore.setup` à la fin de `backup.restore.data` ou à `backup.restore.abort` ; les parties téléchargées, chiffrées, dans `/var/lib/pupitre/restore/` le temps d'être vérifiées puis ouvertes | root. C'est `install.json` d'avant, secrets compris, et rien de plus lisible que ce qu'il était |
| Ce que l'installation a reçu (`/srv/pupitre/install.json`) | 0600 root : les modules, leurs valeurs et leurs secrets, pour qu'un rejeu depuis la machine sache tout répondre | root. Une désinstallation y efface la ligne du module — valeurs et secrets — et chaque module retire de `/etc/pupitre/env` les clés qu'il y avait posées (`forget-passwords`, `forget-providers`). C'est l'exposition acceptée du modèle root-est-privégié : un root qui lit ce fichier lisait déjà `/etc/pupitre/env` |

## Sur le serveur du client

- **Un binaire Go statique**, compilé avec `-trimpath`, symboles et tables de débogage retirés, passé par garble pour renommer et chiffrer les chaînes. Pas de script, pas de fichier source, pas d'archive.
- **Un droit d'usage lié au serveur, et adossé à un abonnement.** Une organisation sans abonnement en cours — l'essai en est un — n'a aucun droit d'usage : la plateforme rend `suspended`, valable jusqu'à l'instant présent, et refuse l'enrôlement. À l'installation, l'agent reçoit un jeton d'enrôlement signé par la plateforme pour cet appareil et ce compte ; il l'échange contre un jeton de serveur. Il lit `/agent/state` toutes les 30 secondes ; chaque lecture réussie renouvelle un droit d'usage valable 24 heures, mis en cache. Sans lecture réussie pendant 7 jours, il passe en **mode restreint** : ce qui tourne continue de tourner, et seules `hello`, `ping`, `snapshot`, `status`, `diag`, `agent.upgrade`, `agent.migrate`, `enroll` et `platform.sync` répondent, comme le fixe le protocole (`RESTRICTED_COMMANDS` de `packages/shared`). `enroll` en fait partie parce que c'est le geste qui répare un serveur dont le jeton a été perdu ou révoqué, et parce que le jeton d'enrôlement vient de la plateforme, pour un compte authentifié et un abonnement en cours. Un binaire copié ailleurs n'a pas de jeton, donc pas de fonctions.
- **Les modules ne s'exécutent qu'avec un droit d'usage valide**, et certaines de leurs étapes dépendent de paramètres reçus de la plateforme à l'enrôlement (versions, URL de téléchargement, clés de dépôts apt), pas seulement de ce que contient le binaire.
- **Aucun secret sur une ligne de commande**, où `ps` le lirait : `mongodump` et `mongorestore` reçoivent leurs identifiants par un fichier de configuration en 0600, `redis-cli` son mot de passe par `REDISCLI_AUTH`, les autres moteurs les leurs par l'entrée standard.
- **Les sauvegardes quittent le serveur chiffrées.** Chaque partie est scellée sur le serveur pour la clé publique du client (X25519, AES-256-GCM par blocs) avant d'atteindre son seau : un seau exposé ou une clé S3 qui fuit ne rendent que des octets opaques. La plateforme ne reçoit qu'une adresse, des tailles, des comptes et l'empreinte du manifeste ; l'agent refuse de restaurer une partie dont l'empreinte diffère de celle que le manifeste enregistré lui donne. Le manifeste, lui, est en clair dans le seau — noms du serveur, des projets, des bases, des dossiers, adresses et branches des dépôts — et le guide le dit. Le seau ne se joint qu'en HTTPS : l'app, l'agent et la plateforme refusent un point d'accès `http://`, sur lequel les signatures des requêtes passeraient en clair. Voir [backups.md](./contracts/backups.md).
- **La galerie de captures n'écoute que la boucle locale** (`127.0.0.1:8099`, lecture seule, sans authentification) et voyage par le protocole, dans la session SSH de l'app. Rien ne la publie : elle n'a d'adresse sur le web que si le client déclare lui-même un projet `shots` sous son domaine — son choix, comme celui d'exposer n'importe quel projet.
- **Distribution contrôlée** : le binaire n'est pas public — les artefacts de l'app le sont, sur `dl.pupitre.studio`, mais l'agent reste dans un bucket privé. L'app le télécharge depuis la plateforme avec le jeton de l'appareil, vérifie sa signature (Ed25519, clé publique embarquée dans l'app), et le pousse elle-même sur le serveur par SSH.
- **Ce qui reste au client, sans condition** : ses projets, ses bases, ses secrets, tmux, les services installés. En mode restreint, il n'a perdu que Pupitre.

## Dans l'app desktop

- Processus principal compilé en bytecode V8 (plugin bytecode d'electron-vite) : c'est là que vit toute la logique, et le jeton de mise à jour avec elle. Le preload reste du JavaScript — Electron le charge dans le renderer, dont le V8 refuse le cache produit par l'isolat Node — et il ne déclare que des noms de canaux. Archive asar dont l'intégrité est vérifiée par fusible, chargement restreint à l'archive, signature et notarisation.
- Le renderer reste du JavaScript minifié : il ne contient que de l'interface.
- Le compte est requis : l'app exige une première connexion réussie, puis vérifie le droit d'usage à chaque lancement, avec la même tolérance de sept jours. Seul un build de développement porte un droit d'usage à lui, miroir du tag `dev` de l'agent.
- Le renderer n'a aucun accès au système. Aucune chaîne libre venue de l'interface n'atteint un shell : le renderer nomme un projet et une action, le main valide le nom contre la liste que l'agent vient de donner.

## Entre l'app et le serveur

- SSH avec la clé du client, `IdentitiesOnly yes`, clé d'hôte épinglée dès l'enrôlement : l'agent envoie l'empreinte de la clé d'hôte à la plateforme, l'app la compare à ce que `ssh` voit, un écart bloque et s'explique.
- Le durcissement ferme root et les mots de passe **après** avoir vérifié qu'une clé ouvre `dev`. Si la vérification échoue, root reste ouvert et l'app le dit.
- Option `keep_root` pour qui veut garder la main sur son serveur : root reste joignable par clé, jamais par mot de passe, et tout le reste du durcissement s'applique. L'app le dit aussi, et ne le confond pas avec un durcissement qui a renoncé.
- Option SSH sur 443 en plus de 22 pour les réseaux qui filtrent.

## Entre le serveur et la plateforme

- HTTPS sortant uniquement. L'agent interroge `/api/v1/agent/state` toutes les 30 secondes (clés d'appareils autorisées, version cible, droit d'usage) et envoie un heartbeat toutes les 5 minutes.
- Les clés d'appareils vont dans un bloc balisé de `/home/dev/.ssh/authorized_keys`, écrit atomiquement, sans toucher aux lignes hors du bloc. Une révocation est effective en moins d'une minute.
- La plateforme ne peut pas exécuter de commande sur un serveur. Le jour où il faut « faire quelque chose », c'est une réinstallation par le client depuis l'app.

## Plateforme

- Better Auth : cookies `Secure`, `HttpOnly`, `SameSite=Lax` ; bearer pour l'app ; limitation des tentatives ; sessions de 60 jours renouvelées par jour ; `admin` réservé au rôle `platform_admin`.
- **Les budgets de limitation sont partagés** : l'API et les routes d'authentification comptent leurs fenêtres dans un Durable Object (`RATE_LIMIT`, huit instances), pas dans la mémoire d'un isolate — un budget tient partout à la fois. Une console sans l'objet retombe sur le compte par isolate, et le dit dans ses journaux.
- **En-têtes de sécurité sur tout ce que le Worker répond** : CSP sans script inline, `frame-ancestors 'none'`, HSTS en production ; les fichiers statiques portent les mêmes interdictions depuis le calque d'assets (`_headers`), chacun ce qui lui sied.
- Clés d'accès (WebAuthn) et second facteur (TOTP) : une clé d'accès connecte sans lien magique ; le second facteur, s'il est activé, est exigé après le lien magique et après la connexion sociale, **jamais après une clé d'accès**, qui prouve déjà l'appareil et la personne. Les codes de récupération sont chiffrés en base et chacun ne sert qu'une fois. C'est vérifié par des tests.
- Le défi du second facteur détruit la session ouverte par le lien magique avant de répondre : aucun jeton bearer ne sort tant que le code n'est pas donné.
- Webhooks Stripe vérifiés par signature, idempotents par identifiant d'événement, rejouables.
- Audit de chaque action d'administration : acteur, action, cible, date.
- **Les clés autorisées d'un serveur dérivent du membre qui lui est attribué, et de son adhésion.** Retirer quelqu'un de l'organisation retire ses clés de tous les serveurs, sans qu'un administrateur ait à y penser. C'est vérifié par un test.
- Suspension automatique d'un serveur sur signalement d'abus : clés retirées, droit d'usage suspendu, email au propriétaire de l'organisation.
- **Aucune erreur ne sort de la plateforme** : les exceptions du Worker restent dans les journaux Cloudflare du compte, aucun service tiers d'observabilité n'est branché.
- La page `/status` répond sans session et n'expose que des agrégats : aucun identifiant de serveur, aucun email, aucun nom d'organisation.
- Dépendances : alertes de sécurité GitHub bloquantes en CI ; mise à jour de Better Auth dans la journée d'une faille publiée.

## Contrat

- Licence d'utilisation, pas de vente : interdiction de désassembler, de redistribuer, d'installer l'agent sur un serveur non enrôlé.
- Conditions, politique d'usage acceptable, DPA pour les clients européens, politique de confidentialité. La plateforme ne stocke ni code, ni secrets, ni contenu du serveur du client.
