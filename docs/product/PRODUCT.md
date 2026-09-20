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
| Se connecte à ses agents avec ses propres abonnements | Ouvre Claude Code, Codex, Cursor, Gemini, Copilot, OpenCode ou Hermes dans le bon dossier, avec le contexte du projet et des skills |
| Paie un abonnement par serveur | Fournit l'app, l'agent, les mises à jour et les alertes |

## Offre et prix

| Offre | Pour qui | Contenu | Prix HT |
| --- | --- | --- | --- |
| **Solo** | un utilisateur | jusqu'à deux serveurs apportés | 5 $ par serveur et par mois, 50 $ par an |
| **Team** | une organisation | serveurs apportés, membres, rôles, attribution d'un serveur à une personne, audit, facture unique | 5 $ par serveur et par mois, 50 $ par an |
| **Hosted** | qui ne veut pas louer | serveur fourni par Pupitre. Plus tard, après 100 serveurs payants | à partir de 29 $ par mois |

Prix en dollars, la LLC vendant depuis les États-Unis ; Stripe convertit dans la devise du client au moment du paiement et ajoute la taxe applicable. Annuel avec deux mois offerts. Essai de 30 jours sans carte, sur une seule machine : les sièges ne changent pas tant que l'essai court, et une organisation n'a qu'un essai. Le prix par serveur est identique pour Solo et Team : l'agence achète l'organisation, pas un tarif. Noms en anglais sur toutes les surfaces publiques ; en français, Solo, Équipe, Hébergé.

Aucun serveur ne tourne sans abonnement : l'essai en est un, et sans lui l'app n'enrôle rien. Quand l'abonnement s'arrête, le serveur du client continue de fonctionner comme un serveur normal : ses projets, ses bases, ses services restent. Il perd Pupitre, rien d'autre. C'est écrit dans les conditions et sur le site.

### Le lancement

Tant que la société n'existe pas, il n'y a ni Stripe ni facturation : la plateforme tourne en mode `launch` (`BILLING_MODE`), le propriétaire paie l'hébergement, et l'abonnement est gratuit pour tout inscrit jusqu'à une date annoncée (`LAUNCH_ENDS_AT`). C'est toujours un abonnement, que la plateforme s'accorde elle-même au premier clic sur « Commencer » : une machine par organisation. L'organisation Pupitre elle-même n'a ni essai ni abonnement ni onboarding : son droit d'usage est permanent, avec `LAUNCH_ADMIN_SEATS` machines. À la date de fin, une organisation qui a enrôlé une machine pendant le lancement garde son siège pour de bon : l'abonnement de lancement devient actif sans échéance, une machine gratuite aussi longtemps que le service existe — c'est ce que les conditions promettent. Une organisation qui n'a rien enrôlé voit son abonnement s'annuler, et le chemin normal reprend : essai, ou carte quand Stripe existe. Repousser la fin du lancement, c'est changer la date en configuration ; le job quotidien aligne les abonnements en cours.

**Liens d'affiliation.** Le propriétaire crée des liens `pupitre.studio/?ref=<code>` depuis la console d'administration. Le site pose le code en cookie sur le domaine, et la console l'attache à l'organisation au moment où elle démarre son abonnement. Pendant le lancement, un lien ne fait que dire d'où vient un inscrit. Quand Stripe est en place, l'organisation venue d'un lien démarre avec le nombre de mois gratuits et de machines que le lien porte, à la place des 30 jours et de la machine unique. Un lien se désactive, jamais ne s'efface : ses inscrits restent comptés.

**Console d'administration.** L'accès vient de l'appartenance à l'organisation Pupitre (`org_pupitre`), que le propriétaire gère depuis sa page Membres comme n'importe quelle organisation : un membre lit tout, un `admin` ou `owner` agit. La console y montre les compteurs (comptes, organisations, serveurs et abonnements par statut, liens et parrainages), la boîte de réception des emails de `pupitre.studio` avec réponse depuis les adresses de contact, les fiches détaillées des comptes, organisations et serveurs, les abonnements, le journal de la plateforme, les versions à promouvoir, l'équipe, et les liens d'affiliation. Suspendre ou rétablir un serveur, bannir un compte, créer un lien, répondre à un mail sont réservés à `admin` et `owner`. L'équipe accorde aussi un abonnement hors Stripe — un produit `granted`, aux sièges et à l'échéance qu'elle choisit —, arrête ou efface un abonnement, y compris chez Stripe pour que le client cesse d'être facturé, et supprime un serveur ou révoque un appareil, chaque geste avec sa raison au journal. Jamais l'accès aux machines.

## Le parcours

1. **Le site.** Le visiteur lit ce que Pupitre fait, et ce qu'il coûte.
2. **Le compte.** Il s'inscrit sur `app.pupitre.studio` ; une organisation personnelle naît avec lui.
3. **L'essai.** Il démarre son essai de trente jours, sans carte, sur une machine. C'est un abonnement : Stripe seul le crée, par webhook ; pendant le lancement, la plateforme le crée elle-même.
4. **Le téléchargement.** La console lui donne l'app pour son système.
5. **La liaison.** Il ouvre l'app, la lie à son compte par le code affiché sur `/auth/device`.
6. **Le serveur.** Il enrôle son VPS, et l'onboarding commence.

L'ordre ne se contourne pas : chaque étape suppose la précédente.

## Le MVP

Une app desktop complète, que le propriétaire utilise sur son propre VPS avec ses projets réels, depuis un compte et un abonnement en cours comme n'importe quel client. L'onboarding en six étapes : ajouter un serveur, inspecter, choisir les services, configurer, installer, durcir et basculer de root vers `dev`. Les projets se créent ensuite, au fil des besoins. Puis le quotidien : tableau de bord, projets, terminaux, agents, services, mise à jour.

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
