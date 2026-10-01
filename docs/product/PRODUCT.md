# Product

## Register

product

## Ce qu'est Pupitre

Une app desktop qui transforme n'importe quel VPS Ubuntu en atelier pour agents IA, et un agent compilé posé sur ce serveur. Le client apporte la machine ; Pupitre l'inspecte, installe les services qu'il choisit, la durcit, et devient la fenêtre sur cette machine : projets, terminaux, agents, bases de données, éditeurs distants.

Le laptop d'un développeur qui fait travailler des agents sature : builds, navigateurs headless, worktrees en parallèle. La réponse est une machine Linux à soi, persistante, accessible en SSH. Pupitre la rend utilisable en dix minutes par quelqu'un qui n'a pas envie d'administrer un serveur, et agréable au quotidien pour quelqu'un qui sait le faire.

## Users

**Primaire — l'indépendant.** Sur Mac, abonnement Claude Max ou Codex, deux à six projets clients. Son laptop chauffe, ses agents s'arrêtent quand il ferme le capot, chaque nouveau projet lui coûte une heure de configuration. Il veut zéro administration et une machine qui travaille la nuit.

**Primaire — la petite agence.** Trois à dix développeurs. Chacun bricole sa machine, personne ne sait ce qui tourne où, un départ laisse des accès ouverts. Elle veut un serveur par développeur, une seule organisation, une configuration reproductible, et la révocation en un clic.

**Tertiaire — le propriétaire de Pupitre.** Support et opérations depuis la console d'administration : voir les serveurs enrôlés, les versions, révoquer, impersonner pour aider. Jamais l'accès aux machines des clients.

Jobs-to-be-done :
- **Indépendant** : avoir une machine où mes agents travaillent sans moi, mes projets en URL, mes bases à portée, sans lire trois guides tmux.
- **Agence** : donner à chaque développeur sa machine, savoir ce qui tourne, couper l'accès de quelqu'un qui part, une licence pour toute l'équipe au-delà des serveurs gratuits.
- **Propriétaire** : faire adopter, accorder les licences, mettre à jour, aider, sans jamais entrer sur un serveur client.

## Ce que le client fait, ce que Pupitre fait

| Le client | Pupitre |
| --- | --- |
| Loue un VPS Ubuntu 22.04 ou 24.04 où il veut, 4 Go de RAM minimum, root ou sudo | L'inspecte, dit ce qui va et ce qui manque, refuse clairement ce qu'il ne sait pas gérer |
| Choisit ses services dans le catalogue | Les installe, les configure, les surveille, les met à jour, les désinstalle |
| Ajoute ses projets par URL git ou dossier | Clone, installe les dépendances, démarre dans tmux, expose l'URL, montre les logs |
| Se connecte à ses agents avec ses propres abonnements | Ouvre Claude Code, Codex, Cursor, Gemini, Copilot, OpenCode ou Hermes dans le bon dossier, avec le contexte du projet et des skills |
| Enrôle jusqu'à trois serveurs gratuitement, demande une licence au-delà | Fournit l'app, l'agent, les mises à jour et les alertes |

## Offre

Pupitre est **gratuit pour toute organisation jusqu'à trois serveurs** (`FREE_SERVERS` de `@pupitre/shared/plans`) : ni carte, ni essai, ni abonnement, ni limite de durée. Tout le catalogue et tout ce que l'app sait faire viennent avec, membres, rôles et audit compris : il n'y a ni édition payante ni fonction réservée. React Consulting SARL AU paie l'hébergement de la plateforme.

Au-delà de trois serveurs, une organisation a besoin d'une **licence**. Une licence ajoute des places aux serveurs gratuits ; aujourd'hui, elle s'obtient en écrivant à `support@pupitre.studio`, et l'équipe l'accorde depuis la console d'administration (produit `granted`). Rien ne se vend : la plateforme tourne en `BILLING_MODE=off`, et le code Stripe dort ([décision 0018](../decisions/0018-source-disponible-et-gratuit.md)). Aucun prix n'est fixé, et le site n'en affiche aucun.

Le **code source est public**, sous licence Apache 2.0 assortie de la Commons Clause. On dit « code source disponible », jamais « open source » : chacun peut lire, modifier et auto-héberger Pupitre, personne ne peut le vendre, ni vendre un service qui en tire l'essentiel de sa valeur — un hébergeur qui facture l'installation de Pupitre en un clic, par exemple.

Quand un serveur quitte Pupitre — licence retirée, agent désinstallé —, il continue de fonctionner comme un serveur normal : ses projets, ses bases, ses services restent. Il perd Pupitre, rien d'autre. C'est écrit dans les conditions et sur le site.

L'organisation Pupitre elle-même n'a ni licence ni onboarding : la sienne est permanente, avec `PLATFORM_ORGANIZATION_SEATS` machines.

**Liens d'affiliation.** Le propriétaire crée des liens `pupitre.studio/?ref=<code>` depuis la console d'administration. Le site pose le code en cookie sur le domaine, et la console l'attache à l'organisation à l'inscription. Un lien ne sert qu'au suivi d'un projet au code public : visites par jour, inscriptions, et serveurs enrôlés par les organisations qu'il a amenées. Aucune offre ne s'y attache. Un lien se désactive, jamais ne s'efface : ses inscrits restent comptés.

**Console d'administration.** L'accès vient de l'appartenance à l'organisation Pupitre (`org_pupitre`), que le propriétaire gère depuis sa page Membres comme n'importe quelle organisation : un membre lit tout, un `admin` ou `owner` agit. La console y montre les compteurs (comptes, organisations, serveurs et licences par statut, liens et parrainages), la boîte de réception des emails de `pupitre.studio` avec réponse depuis les adresses de contact, les fiches détaillées des comptes, organisations et serveurs, les licences, le journal de la plateforme, les versions à promouvoir, l'équipe, et les liens d'affiliation. Suspendre ou rétablir un serveur, bannir un compte, créer un lien, répondre à un mail sont réservés à `admin` et `owner`. L'équipe accorde aussi une licence — un produit `granted`, aux places et à l'échéance qu'elle choisit —, arrête ou efface une licence, et supprime un serveur ou révoque un appareil, chaque geste avec sa raison au journal. Jamais l'accès aux machines.

## Le parcours

1. **Le site.** Le visiteur lit ce que Pupitre fait, qu'il est gratuit jusqu'à trois serveurs, et que son code est public.
2. **Le compte.** Il s'inscrit sur `app.pupitre.studio` ; une organisation personnelle naît avec lui, déjà licenciée pour ses trois premiers serveurs.
3. **Le téléchargement.** La console lui donne l'app pour son système.
4. **La liaison.** Il ouvre l'app, la lie à son compte par le code affiché sur `/auth/device`.
5. **Le serveur.** Il enrôle son VPS, et l'onboarding commence.

L'ordre ne se contourne pas : chaque étape suppose la précédente.

## Le MVP

Une app desktop complète, que le propriétaire utilise sur son propre VPS avec ses projets réels, depuis un compte et dans ses serveurs gratuits, comme n'importe quel client. L'onboarding en six étapes : ajouter un serveur, inspecter, choisir les services, configurer, installer, durcir et basculer de root vers `dev`. Les projets se créent ensuite, au fil des besoins. Puis le quotidien : tableau de bord, projets, terminaux, agents, services, mise à jour.

Le MVP est réussi quand le propriétaire travaille tous les jours avec ses projets sur un serveur que l'app a entièrement installé, sans ouvrir un terminal hors de l'app.

## Brand Personality

**Voix.** Précise, calme, technique sans jargon. On nomme les choses par leur nom réel : tmux, `authorized_keys`, PostgreSQL 17. On ne dit jamais « AI-powered », « seamless », « blazing fast ».

**Ton.** Celui d'un outil sérieux pour des gens qui travaillent, dans le registre de Linear, Raycast ou Zed. Le produit parle de ce qu'il fait, jamais de ce qu'il promet.

**Trois mots.** Précis. Sobre. Fiable.

**Objectif émotionnel.** « Ma machine est prête, mes agents travaillent, je vois tout. »

**Raisons de croire.**
- Construit par quelqu'un qui fait tourner ses propres agents sur un VPS tous les jours. Une phrase, une fois, jamais un badge.
- Le client garde tout s'il quitte Pupitre, et peut lire chaque ligne du code qu'il installe. Aucune connexion entrante, aucune clé privée hors de son laptop, aucun accès du support à sa machine.
- Les vrais standards nommés : SSH ed25519, ufw, fail2ban, tmux, systemd. Jamais « bank-grade ».

## Anti-références

- Le SaaS IA générique : dégradés violets, cartes icône-titre identiques, faux témoignages, bannières d'urgence, « AI-powered » partout.
- Le théâtre de la confiance : cadenas, « sécurité militaire », imagerie de coffre-fort.
- Le terminal cosplay : fond noir avec du vert néon, curseur clignotant en décoration.
- L'hébergeur discount : prix barrés, compteurs de stock, badges « meilleur choix ».

## Design Principles

1. **L'état se lit à la forme.** Un serveur en ligne, un projet arrêté, une installation en échec : la forme le dit avant la couleur.
2. **Le serveur est la vérité.** L'app montre ce que l'agent renvoie. Elle ne devine rien et n'invente pas de donnée.
3. **Chaque attente dit ce qui se passe.** « Installation de PostgreSQL, étape 3 sur 7, 40 s », jamais un spinner seul.
4. **Chaque échec dit le remède.** Une vérification qui échoue affiche la commande qui la répare.
5. **Rien de décoratif.** Une ligne, un pas de gris, une graisse. Pas d'ombre, pas de dégradé, pas d'illustration.
