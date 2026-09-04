# Product

## Register

product

## Ce qu'est Pupitre

Une app desktop qui transforme n'importe quel VPS Ubuntu en atelier pour agents IA, et un agent compilé posé sur ce serveur. Le client apporte la machine ; Pupitre l'inspecte, installe les services qu'il choisit, la durcit, et devient la fenêtre sur cette machine : projets, terminaux, agents, bases de données, éditeurs distants.

Le laptop d'un développeur qui fait travailler des agents sature : builds, navigateurs headless, worktrees en parallèle. La réponse est une machine Linux à soi, persistante, accessible en SSH. Pupitre la rend utilisable en dix minutes par quelqu'un qui n'a pas envie d'administrer un serveur, et agréable au quotidien pour quelqu'un qui sait le faire.

## Users

**Primaire — l'indépendant.** Sur Mac, abonnement Claude Max ou Codex, deux à six projets clients. Son laptop chauffe, ses agents s'arrêtent quand il ferme le capot, chaque nouveau projet lui coûte une heure de configuration. Il veut zéro administration et une machine qui travaille la nuit.

**Primaire — la petite agence.** Trois à dix développeurs. Chacun bricole sa machine, personne ne sait ce qui tourne où, un départ laisse des accès ouverts. Elle veut un serveur par développeur, une facture, une configuration reproductible, et la révocation en un clic.

**Tertiaire — le propriétaire de Pupitre.** Support et opérations depuis la console d'administration : voir les serveurs enrôlés, les versions, révoquer, impersonner pour aider. Jamais l'accès aux machines des clients.

Jobs-to-be-done :
- **Indépendant** : avoir une machine où mes agents travaillent sans moi, mes projets en URL, mes bases à portée, sans lire trois guides tmux.
- **Agence** : donner à chaque développeur sa machine, savoir ce qui tourne, couper l'accès de quelqu'un qui part, payer une fois.
- **Propriétaire** : vendre, mettre à jour, aider, sans jamais entrer sur un serveur client.

## Ce que le client fait, ce que Pupitre fait

| Le client | Pupitre |
| --- | --- |
| Loue un VPS Ubuntu 22.04 ou 24.04 où il veut, 4 Go de RAM minimum, root ou sudo | L'inspecte, dit ce qui va et ce qui manque, refuse clairement ce qu'il ne sait pas gérer |
| Choisit ses services dans le catalogue | Les installe, les configure, les surveille, les met à jour, les désinstalle |
| Ajoute ses projets par URL git ou dossier | Clone, installe les dépendances, démarre dans tmux, expose l'URL, montre les logs |
| Se connecte à ses agents avec ses propres abonnements | Ouvre Claude Code, Codex ou Hermes dans le bon dossier, avec le contexte du projet et des skills |
| Paie un abonnement par serveur | Fournit l'app, l'agent, les mises à jour, les sauvegardes et les alertes |

## Offre et prix

| Offre | Pour qui | Contenu | Prix HT |
| --- | --- | --- | --- |
| **Solo** | un utilisateur | jusqu'à deux serveurs apportés | 19 € par serveur et par mois |
| **Team** | une organisation | serveurs apportés, membres, rôles, attribution d'un serveur à une personne, audit, facture unique | 19 € par serveur et par mois |
| **Hosted** | qui ne veut pas louer | serveur fourni par Pupitre. Plus tard, après 100 serveurs payants | à partir de 29 € par mois |

Annuel avec deux mois offerts. Essai de 14 jours sans carte. Le prix par serveur est identique pour Solo et Team : l'agence achète l'organisation, pas un tarif. Noms en anglais sur toutes les surfaces publiques ; en français, Solo, Équipe, Hébergé.

Quand l'abonnement s'arrête, le serveur du client continue de fonctionner comme un serveur normal : ses projets, ses bases, ses services restent. Il perd Pupitre, rien d'autre. C'est écrit dans les conditions et sur le site.

## Le MVP

Une app desktop complète, sans compte ni paiement, que le propriétaire utilise sur son propre VPS avec ses projets réels. L'onboarding en sept étapes : ajouter un serveur, inspecter, choisir les services, configurer, installer, durcir et basculer de root vers `dev`, premier projet. Puis le quotidien : tableau de bord, projets, terminaux, agents, services, mise à jour.

Le MVP est réussi quand le propriétaire travaille tous les jours avec ses projets sur un serveur que l'app a entièrement installé, sans ouvrir un terminal hors de l'app.

## Brand Personality

**Voix.** Précise, calme, technique sans jargon. On nomme les choses par leur nom réel : tmux, `authorized_keys`, PostgreSQL 17. On ne dit jamais « AI-powered », « seamless », « blazing fast ».

**Ton.** Celui d'un outil sérieux pour des gens qui travaillent, dans le registre de Linear, Raycast ou Zed. Le produit parle de ce qu'il fait, jamais de ce qu'il promet.

**Trois mots.** Précis. Sobre. Fiable.

**Objectif émotionnel.** « Ma machine est prête, mes agents travaillent, je vois tout. »

**Raisons de croire.**
- Construit par quelqu'un qui fait tourner ses propres agents sur un VPS tous les jours. Une phrase, une fois, jamais un badge.
- Le client garde tout si l'abonnement s'arrête. Aucune connexion entrante, aucune clé privée hors de son laptop, aucun accès du support à sa machine.
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
