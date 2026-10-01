# Runbook de production

Quoi regarder, dans quel ordre, quand quelque chose casse chez un client ou sur la plateforme. Chaque commande ici existe dans le dépôt ; une commande qui change se corrige ici dans la même passe. Les noms exacts des ressources sont dans [`monorepo.md`](./monorepo.md), les gestes de mise en ligne dans [`deploy.md`](./deploy.md).

## Les trois endroits où lire

**La console d'administration**, `app.pupitre.studio/dashboard/admin` : organisations, serveurs, licences, événements (`/dashboard/admin/events`), boîte mail. C'est la première lecture : elle ne demande rien d'autre qu'une session de l'équipe.

**La base**, quand la console ne montre pas ce qu'on cherche. Depuis `apps/web` :

```bash
bun x wrangler d1 execute DB --env production --remote \
  --command 'SELECT "createdAt","action","targetType","targetId","payload" FROM "Event" ORDER BY "createdAt" DESC LIMIT 50'
```

`Event` est le journal d'audit : `action` (`server.enrolled`, `server.exchanged`, `server.suspended`, `subscription.created`, `release.published`…), `targetType` et `targetId`, `organizationId`, `actorUserId`, `payload`. Une requête de lecture ne coûte rien ; une écriture à la main en production ne se fait pas — elle passe par une route de l'API ou par une migration.

**Les journaux du Worker** : tableau de bord Cloudflare → *Workers* → `ppt-web-production` → *Logs* (observabilité activée, échantillonnage à 100 %, piles lisibles), ou en direct depuis `apps/web` :

```bash
bun x wrangler tail --env production
```

Aucune erreur ne part vers un service tiers : ce qui n'est pas dans ces journaux n'existe nulle part.

**Le serveur du client**, quand c'est lui qui est en cause. Le client est root chez lui ; on ne s'y connecte jamais sans lui. Ce qu'on lui fait lancer :

| Commande | Ce qu'elle dit |
| --- | --- |
| `sudo pupitred report` | le rapport de la dernière installation, en JSON : chaque module, chaque étape `failed` ou `warned` avec sa commande de rejeu ; une installation coupée y est marquée interrompue |
| `dev doctor` | outils, services, session tmux et projets, chacun avec son remède |
| `dev status --json` | la vue de la machine que l'app lit |
| `sudo tail -n 200 /var/log/pupitre.log` | le journal de l'agent : commandes, chemins, jamais un secret |
| `sudo cat /var/lib/pupitre/report.json` | le même rapport que `pupitred report`, brut |
| `sudo cat /var/lib/pupitre/license.json` | la dernière licence lue : `state`, `valid_until`, `checked_at` (`entitlement.json` sur un agent antérieur à 2.0.0, que la migration 8 renomme) |
| `systemctl status pupitred` · `journalctl -u pupitred -n 200` | le daemon qui lit la plateforme toutes les 30 secondes |
| `sudo pupitred migrate --status` | la révision de la configuration, ce qui reste dû, les sauvegardes gardées |

`sudo` demande le mot de passe de `dev` depuis la [décision 0015](./decisions/0015-sudo-par-mot-de-passe.md) : le client le copie depuis la fiche du serveur dans l'app. `dev doctor` et `dev status` n'en ont pas besoin.

## Un onboarding qui meurt

L'app enchaîne `server` (adresse, compte, clé), `inspection`, `agent` (le binaire poussé), `catalog`, `config`, `install` (enrôlement puis modules), `harden`, `done`. Savoir à quelle étape il s'est arrêté dit presque tout.

1. **Avant l'agent** — l'adresse ne répond pas en SSH, la clé est refusée, le mot de passe du compte distant est faux. L'app le dit sous le formulaire ; rien n'est créé ni sur le serveur ni sur la plateforme.
2. **Le binaire de l'agent** — l'app le télécharge par `GET /api/v1/releases/agent/:version`, qui répond 303 vers une URL R2 signée de cinq minutes. Un échec ici se lit dans les journaux du Worker (la route, puis R2) : une version que `Release` ne tient pas pour cette architecture, ou un objet absent du seau `ppt-agent`. Le 2026-09-14, c'était un 400 de R2.
3. **L'enrôlement** — dans la base, `server.enrolled` pour ce serveur dit que la plateforme a délivré le jeton d'enrôlement ; `server.exchanged` dit que l'agent l'a échangé contre son jeton de serveur. Le premier sans le second : l'agent n'a jamais joint la plateforme. Sur le serveur, `/etc/pupitre/platform.url` doit nommer `https://app.pupitre.studio`, `journalctl -u pupitred` dit pourquoi la requête échoue, et `/etc/pupitre/server.token` n'existe pas encore. Un enrôlement coupé se reprend : relancer l'étape depuis l'app, ou « Rattacher à nouveau ce serveur » sur sa page.
4. **Les modules** — `sudo pupitred report` nomme l'étape tombée, sa sortie et sa commande de rejeu ; `/var/log/pupitre.log` a le détail. Un échec n'arrête pas les autres modules : le rapport dit tout en une fois. Rejouer depuis l'app est sûr, les étapes sont idempotentes.
5. **Le durcissement** — root ne se ferme que si une clé ouvre `dev`. S'il s'arrête, root reste ouvert et l'app le dit ; la cause est dans le rapport (`harden`). Un client qui ne joint plus rien juste après : voir [fail2ban](#fail2ban-a-banni-un-client).

## « Licence requise » qui ne part pas

L'agent passe en mode restreint quand il n'a pas de jeton de serveur, quand sa dernière licence lue a plus de sept jours, ou quand la plateforme a répondu `suspended`. Seules `hello`, `ping`, `snapshot`, `status`, `diag`, `agent.upgrade`, `agent.migrate`, `enroll` et `platform.sync` répondent ; rien de ce qui tourne ne s'arrête.

1. **L'organisation tient-elle dans sa licence ?** Console → l'organisation : ses serveurs qui occupent un siège contre `FREE_SERVERS` plus les places de sa licence. Gratuite jusqu'à trois serveurs, elle n'a besoin de rien ; au-delà sans licence vivante — un octroi expiré —, la plateforme rend `grace` sept jours puis `suspended` : l'équipe accorde ou prolonge une licence (`subscription.granted`, Console → Licences), ou le client supprime des serveurs. Une organisation suspendue ou fermée par l'équipe est `suspended` quoi qu'elle tienne.
2. **Le serveur est-il suspendu ou révoqué ?** Console → Serveurs : `status` (`grace`, `suspended`, `revoked`) et `suspendedReason`. Un serveur suspendu par l'équipe se rétablit depuis sa fiche (`server.restored`).
3. **L'agent lit-il la plateforme ?** `sudo cat /var/lib/pupitre/license.json` : un `checked_at` ancien dit que le daemon ne joint plus la console — `systemctl status pupitred`, `journalctl -u pupitred`. Sans `/etc/pupitre/server.token`, le serveur n'a jamais fini son enrôlement (étape 3 ci-dessus).
4. **La plateforme dit valide et l'app dit restreint ?** Le daemon relit toutes les 30 secondes ; l'app peut le demander tout de suite par `platform.sync`, qui reste ouverte en mode restreint. Si rien ne bouge, « Rattacher à nouveau ce serveur » ré-enrôle : un jeton perdu ou révoqué se répare ainsi, sans toucher à ce qui tourne.

## Une release qui échoue

`release.yml` enchaîne `ci` → `agent` → `agent-arm64` → `desktop` (macOS, Windows, Linux) → `publish` → `merge`. Rien n'est signé sans CI verte, et `merge` n'ouvre la pull request `staging` → `main` qu'une fois la version téléchargeable. La marche complète est le skill `release`.

- **Un job tombé sur un aléa** (runner, réseau, notarisation lente) : *Re-run failed jobs* dans GitHub. Chaque étape est idempotente : ce qui est déjà dans le seau est réécrit à l'identique, ce qui est déjà déclaré répond 200.
- **Un correctif dans la chaîne elle-même** : commit sur `staging`, puis `gh workflow run release.yml --ref staging -f version=X.Y.Z`. Relancer sur le tag rejouerait la chaîne cassée qu'il désigne.
- **`merge` refuse** faute de check vert sur la tête de `staging` : des commits sont arrivés après le tag. La version est publiée, `main` attend ; la pull request restée ouverte se vérifie puis se fusionne à la main, en merge commit.
- **Une version publiée est mauvaise** : on ne dépublie rien, on revient en arrière. `gh workflow run promote.yml -f version=<précédente> -f channel=stable` remet la version précédente dans le canal, agent et app, et pointe les flux de mise à jour sur ses fichiers. Une app déjà montée ne redescend pas : elle attend la suivante.
- **La console ou le site cassés après la fusion** : Cloudflare Builds a redéployé sur le push de `main`. Retour sur la version précédente du Worker : `bun x wrangler rollback --config apps/web/dist/server/wrangler.json`, ou la liste des déploiements dans le tableau de bord. Une migration D1 ne se rejoue pas à l'envers : elle se corrige par une migration suivante.

## Un mail qui n'arrive pas

**Un mail envoyé à `@pupitre.studio`** (support, légal…) passe par la règle catch-all d'Email Routing, qui l'envoie au handler `email` du Worker ; il devient une ligne de `MailMessage` (`delivery = 'received'`) dans un fil de la boîte.

- Rien dans la boîte : tableau de bord Cloudflare → *Email* → *Email Routing* → l'activité de la zone dit si le message est arrivé, a été rejeté, ou a été remis au Worker. Remis au Worker sans ligne : les journaux du Worker. Un message au-dessus de 20 Mio est refusé à la porte, et l'expéditeur en est averti.
- Arrivé mais rangé dans « Autres » : aucune `MailMailbox` ne déclare cette adresse. Créer la boîte rattache les fils déjà reçus.

**Un mail que la plateforme envoie** — lien de connexion, alerte, réponse de l'équipe — part par Cloudflare Email Sending, le binding `EMAIL`. En production, un binding absent fait échouer l'envoi au lieu de l'écrire dans les journaux.

- Une réponse de la boîte qui casse reste dans le fil, `delivery = 'failed'`, la cause dans `error`, avec une activité `reply_failed` : `SELECT "createdAt","address","error" FROM "MailMessage" WHERE "delivery" = 'failed' ORDER BY "createdAt" DESC LIMIT 20`.
- Un lien de connexion qui n'arrive pas n'a pas de ligne en base : les journaux du Worker, puis l'activité d'Email Sending dans le tableau de bord, puis le dossier indésirable du client.

## fail2ban a banni un client

Le durcissement pose une prison `sshd` (`/etc/fail2ban/jail.d/pupitre.local`) : cinq échecs en dix minutes bannissent l'adresse une heure, sur le port SSH et sur 443 quand il est ouvert. Le symptôme côté client : `Connection reset`, `kex_exchange_identification` ou un délai dépassé, depuis cet ordinateur seulement. Souvent, des essais en root après la fermeture de root, ou un outil qui présente une autre clé en boucle.

- Attendre l'heure, ou lever le ban depuis une autre adresse ou depuis la console de l'hébergeur :

```bash
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip <adresse>
```

- Puis trouver ce qui échoue : `journalctl -u ssh -n 100` sur le serveur, et l'hôte que l'outil vise sur l'ordinateur — il doit passer par la configuration SSH de l'app (`ssh <nom du serveur>` une fois la ligne `Include` posée), pas par `root@`.

## Le mot de passe sudo perdu

Le mot de passe de `dev` vit dans le trousseau de l'ordinateur qui l'a tiré ([décision 0015](./decisions/0015-sudo-par-mot-de-passe.md)) ; le serveur n'en a que l'empreinte, et la plateforme rien.

- **Un autre ordinateur du client le tient encore** : il le copie depuis la fiche du serveur, et on le saisit sur celui qui ne l'a plus (« Saisir le mot de passe sudo de dev »).
- **Plus aucun ordinateur ne le tient** : sans lui, aucun geste privilégié ne passe, et relancer la sécurisation en est un. Depuis la console de l'hébergeur, en root : `passwd dev`, puis ce mot de passe se saisit dans l'app. Relancer ensuite la sécurisation depuis l'app en tire un nouveau et le garde au trousseau : `harden.sudo` rejouée ne change que le mot de passe.

L'équipe ne peut rien faire à la place du client : c'est la propriété voulue.

## Tous les appareils perdus

Depuis la [décision 0014](./decisions/0014-cles-approuvees-par-un-appareil.md), une clé n'entre sur un serveur qu'approuvée par un appareil qui y est déjà. Quand il n'en reste aucun, la plateforme ne peut pas en ajouter, et l'équipe non plus.

1. Sur le nouvel ordinateur : installer l'app, se connecter. L'appareil est ajouté au compte (connexion récente, passkey ou second facteur compris, et un email part). Sa clé publique est `keys/device.pub` dans le dossier de données de l'app.
2. Depuis la console de l'hébergeur, en root :

```bash
pupitred keys reset --key "<clé publique OpenSSH>"
# ou
pupitred keys reset --key /chemin/vers/device.pub
```

Le bloc géré d'`authorized_keys` et les signataires ne tiennent plus que cette clé. `keys reset` refuse hors de root.

3. Dans l'app, ajouter le serveur par son adresse : l'onboarding reprend cet appareil et repose sa clé par `keys.trust`. Les autres appareils du client s'approuvent ensuite depuis celui-ci.

Retirer un appareil perdu du compte, dans la console, retire sa clé de tous les serveurs — sauf là où elle serait la dernière du bloc, que l'agent ne vide jamais.
