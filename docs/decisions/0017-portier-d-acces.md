# 0017 — Les adresses publiées passent par un portier, et un projet est protégé par défaut

Date : 2026-09-27 · Statut : acceptée

Jusqu'ici, une adresse publiée par le tunnel ou par Caddy répondait à quiconque la connaissait. Désormais, chaque nom publié passe par **`pupitre-gate`**, un proxy de `pupitred` qui écoute sur `127.0.0.1:8098`. cloudflared et Caddy lui envoient tous les noms sans toucher au `Host`.

**La protection**
- Un projet est **protégé par défaut**, y compris ceux qui existaient avant (migration 7 du registre).
- Un processus peut s'en écarter, dans un sens ou dans l'autre. C'est le cas d'un récepteur de webhooks qui vérifie sa propre signature.
- Un nom public est transmis tel quel.

**Les clés**
- Un nom protégé ne répond qu'à une clé `ppk_<id>_<secret>`, présentée de trois façons :
  - dans l'en-tête `Pupitre-Key` ;
  - dans le paramètre `pupitre_key`, là où un en-tête ne se pose pas (WebSocket, EventSource) ;
  - par le cookie `__Host-pupitre` qu'un lien ou la page de connexion posent.
- Le portier retire ces trois marques avant de transmettre la requête. Le site garde son propre `Authorization`, ses cookies et sa query, et reçoit le nom de la clé dans `Pupitre-Identity`.
- Une navigation garde son chemin et sa query : la clé est retirée de l'adresse par une redirection 303, et la page de connexion revient à l'adresse demandée.

**Où vivent les clés**
- L'app tire la clé sur l'ordinateur du client et la garde au trousseau. Le serveur n'en reçoit que l'empreinte SHA-256, dans `/etc/pupitre/gate/access.json`.
- Une clé ouvre tout le serveur, y compris les projets ajoutés plus tard, ou une liste de projets.
- Elle n'expire pas. Plusieurs personnes peuvent la partager, et la révoquer coupe tout le monde à la requête suivante.
- Chaque ordinateur tire sa propre clé la première fois qu'il ouvre une adresse protégée, et l'ajoute ensuite à chaque adresse qu'il ouvre.

**Isolation du portier**
- Il tourne en root **sans aucune capacité**, sur un système en lecture seule, et ne voit de `/etc/pupitre` que `gate/`.
- Il relit ses deux fichiers sur `SIGHUP` : une clé révoquée ou une protection changée prennent effet sans couper les WebSocket en cours.

**Privilèges**
- Les commandes `access.*` demandent la session privilégiée.
- Un `project.add` ou un `project.update` qui ouvre un projet ou un processus au web (`protected: false`) la demande aussi. Un agent IA qui tourne en `dev` ne peut donc pas lever la protection de lui-même.

Pourquoi :
- Un tunnel exposait le travail en cours de chaque projet à qui trouvait l'adresse.
- La protection devait marcher pour tous les clients sans rien configurer ailleurs, avec Caddy comme avec le tunnel.
- Elle devait marcher pour un navigateur comme pour un client d'API ou un simulateur, sans entrer en collision avec l'authentification du site.

Écarté :
- **Cloudflare Access** :
  - rien pour Caddy ;
  - une organisation Zero Trust à ouvrir chez chaque client ;
  - des permissions de jeton en plus ;
  - pas de WebSocket depuis un navigateur sans cookie ;
  - les pré-vols CORS bloqués.
- **Une connexion par le compte Pupitre** : elle mettrait la plateforme sur le chemin de chaque requête, contre la règle des sept jours hors ligne.
- **Une expiration des clés** : la révocation suffit, et une clé qui expire casse en silence un client d'API.
- **Ne faire passer par le portier que les noms protégés** : chaque changement de protection réécrirait l'ingress et relancerait cloudflared. Tout passer par le portier garde l'ingress stable, et une protection se change par un simple rechargement.
