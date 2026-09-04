# Sécurité

## Ce qu'on ne contourne pas

Un client est root sur son serveur : il peut copier tout fichier qui s'y trouve, y compris un binaire. Aucune technique ne l'en empêche. Ce qu'on fait, c'est rendre la copie **inutile** (le binaire ne fait rien sans un droit d'usage valide, et la valeur est dans l'app et la plateforme), **coûteuse** à lire (compilé, dépouillé, obfusqué), et **interdite** (contrat de licence). C'est le modèle de tous les agents commerciaux installés chez le client.

## Où vivent les secrets

| Secret | Où | Qui le voit |
| --- | --- | --- |
| Clé privée SSH d'un appareil | dossier de données de l'app, `keys/<serveur>` en 0600 | l'utilisateur, sur cet appareil. Jamais l'API, jamais la console, jamais un email |
| Jeton de session desktop (bearer) | `safeStorage` : trousseau macOS, DPAPI Windows, libsecret Linux | l'app |
| Jeton d'enrôlement | mémoire de l'app, une fois, à l'installation | l'app, puis l'agent qui l'échange |
| Jeton de serveur | `/etc/pupitre/server.token`, 0600 root ; haché en base | l'agent. Ne donne accès qu'à l'état de son propre serveur. Rotation à chaque réinstallation |
| Jetons Stripe, Neon, R2, clé de signature des binaires | secrets Wrangler et GitHub Actions | l'API, la CI |
| Secrets du client (mots de passe de bases, jetons Cloudflare, 1Password) | `/etc/pupitre/env`, 0600, sur son serveur | lui seul. Ils ne remontent jamais |

## Sur le serveur du client

- **Un binaire Go statique**, compilé avec `-trimpath`, symboles et tables de débogage retirés, passé par garble pour renommer et chiffrer les chaînes. Pas de script, pas de fichier source, pas d'archive.
- **Un droit d'usage lié au serveur.** À l'installation, l'agent reçoit un jeton d'enrôlement signé par la plateforme pour cet appareil et ce compte ; il l'échange contre un jeton de serveur. Il lit `/agent/state` toutes les 30 secondes ; chaque lecture réussie renouvelle un droit d'usage valable 24 heures, mis en cache. Sans lecture réussie pendant 7 jours, il passe en **mode restreint** : ce qui tourne continue de tourner, et seules `hello`, `ping`, `snapshot`, `status`, `diag` et `agent.upgrade` répondent, comme le fixe le protocole. Un binaire copié ailleurs n'a pas de jeton, donc pas de fonctions.
- **Les modules ne s'exécutent qu'avec un droit d'usage valide**, et certaines de leurs étapes dépendent de paramètres reçus de la plateforme à l'enrôlement (versions, URL de téléchargement, clés de dépôts apt), pas seulement de ce que contient le binaire.
- **Une exception connue** : `mongodump` et `mongorestore` n'acceptent leurs identifiants que sur la ligne de commande, donc ils sont visibles dans `ps` le temps de la commande. Tous les autres moteurs reçoivent leurs secrets par l'entrée standard. À revoir si MongoDB propose un jour un fichier de configuration pour ses outils.
- **Distribution contrôlée** : le binaire n'est pas public. L'app le télécharge depuis la plateforme avec le jeton de l'appareil, vérifie sa signature (Ed25519, clé publique embarquée dans l'app), et le pousse elle-même sur le serveur par SSH.
- **Ce qui reste au client, sans condition** : ses projets, ses bases, ses secrets, tmux, les services installés. En mode restreint, il n'a perdu que Pupitre.

## Dans l'app desktop

- Processus principal compilé en bytecode V8 (plugin bytecode d'electron-vite) : c'est là que vit toute la logique, et le jeton de mise à jour avec elle. Le preload reste du JavaScript — Electron le charge dans le renderer, dont le V8 refuse le cache produit par l'isolat Node — et il ne déclare que des noms de canaux. Archive asar dont l'intégrité est vérifiée par fusible, chargement restreint à l'archive, signature et notarisation.
- Le renderer reste du JavaScript minifié : il ne contient que de l'interface.
- Le compte et le droit d'usage sont vérifiés au lancement, avec la même tolérance de sept jours.
- Le renderer n'a aucun accès au système. Aucune chaîne libre venue de l'interface n'atteint un shell : le renderer nomme un projet et une action, le main valide le nom contre la liste que l'agent vient de donner.

## Entre l'app et le serveur

- SSH avec la clé du client, `IdentitiesOnly yes`, clé d'hôte épinglée dès l'enrôlement : l'agent envoie l'empreinte de la clé d'hôte à la plateforme, l'app la compare à ce que `ssh` voit, un écart bloque et s'explique.
- Le durcissement ferme root et les mots de passe **après** avoir vérifié qu'une clé ouvre `dev`. Si la vérification échoue, root reste ouvert et l'app le dit.
- Option SSH sur 443 en plus de 22 pour les réseaux qui filtrent.

## Entre le serveur et la plateforme

- HTTPS sortant uniquement. L'agent interroge `/api/v1/agent/state` toutes les 30 secondes (clés d'appareils autorisées, version cible, droit d'usage) et envoie un heartbeat toutes les 5 minutes.
- Les clés d'appareils vont dans un bloc balisé de `/home/dev/.ssh/authorized_keys`, écrit atomiquement, sans toucher aux lignes hors du bloc. Une révocation est effective en moins d'une minute.
- La plateforme ne peut pas exécuter de commande sur un serveur. Le jour où il faut « faire quelque chose », c'est une réinstallation par le client depuis l'app.

## Plateforme

- Better Auth : cookies `Secure`, `HttpOnly`, `SameSite=Lax` ; bearer pour l'app ; limitation des tentatives ; sessions de 60 jours renouvelées par jour ; `admin` réservé au rôle `platform_admin`.
- Clés d'accès (WebAuthn) et second facteur (TOTP) : une clé d'accès connecte sans lien magique ; le second facteur, s'il est activé, est exigé après le lien magique et après la connexion sociale, **jamais après une clé d'accès**, qui prouve déjà l'appareil et la personne. Les codes de récupération sont chiffrés en base et chacun ne sert qu'une fois. C'est vérifié par des tests.
- Le défi du second facteur détruit la session ouverte par le lien magique avant de répondre : aucun jeton bearer ne sort tant que le code n'est pas donné.
- Webhooks Stripe vérifiés par signature, idempotents par identifiant d'événement, rejouables.
- Audit de chaque action d'administration : acteur, action, cible, date.
- **Les clés autorisées d'un serveur dérivent du membre qui lui est attribué, et de son adhésion.** Retirer quelqu'un de l'organisation retire ses clés de tous les serveurs, sans qu'un administrateur ait à y penser. C'est vérifié par un test.
- Suspension automatique d'un serveur sur signalement d'abus : clés retirées, droit d'usage suspendu, email au propriétaire de l'organisation.
- Dépendances : alertes de sécurité GitHub bloquantes en CI ; mise à jour de Better Auth dans la journée d'une faille publiée.

## Contrat

- Licence d'utilisation, pas de vente : interdiction de désassembler, de redistribuer, d'installer l'agent sur un serveur non enrôlé.
- Conditions, politique d'usage acceptable, DPA pour les clients européens, politique de confidentialité. La plateforme ne stocke ni code, ni secrets, ni contenu du serveur du client.
