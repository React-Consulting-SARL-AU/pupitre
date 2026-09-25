# Légal

Ce que le dépôt dit de l'éditeur, où il le dit, et ce qui change le jour où une société existe. Une seule source : [`packages/shared/src/legal/index.ts`](../packages/shared/src/legal/index.ts). Le site, la console et l'app desktop la lisent ; aucun d'eux ne réécrit un nom, une adresse ni une adresse email de contact.

## L'état actuel

Le service est ouvert, gratuit pendant le lancement, et édité par une personne physique : Jordan Monier, résidant au Maroc. Il n'y a pas de société ; le dépôt ne revendique donc aucune raison sociale, aucune forme juridique, aucun siège et aucun numéro. Le projet — code, marque, noms de domaine, plateforme — lui appartient personnellement, et les documents disent que l'entité responsable, le mode d'encaissement et le prestataire de paiement pourront changer, avec trente jours de préavis par email. Le plan d'immatriculation vit hors dépôt, dans [`incorporation.pdf`](./incorporation.pdf).

Ce que la source partagée fixe :

- `LEGAL_ENTITY.status` vaut `individual`. `owner` et `publicationDirector` portent « Jordan Monier », `jurisdiction` le Maroc — le droit qui régit les conditions et les tribunaux compétents — et les champs d'identité d'une société valent `null`. `copyrightHolder()` rend ce nom, et rendra la raison sociale le jour où la société sera immatriculée.
- `CODE_SIGNING_ENTITY` nomme React Consulting SARL AU, la société marocaine dont les certificats signent les builds macOS et Windows de l'app. Elle signe et ne fait rien d'autre : la licence le dit, elle n'est ni l'éditeur ni partie au contrat.
- `LEGAL_DOCUMENTS` porte les douze documents, leur ordre et leur date. Ils sont publiés, sans brouillon ni passage à compléter.
- `SUB_PROCESSORS` ne nomme que ceux qui touchent une donnée personnelle : Cloudflare (hébergement, base de données et fichiers en Amérique du Nord, emails), PostHog (mesure d'audience, événements stockés dans l'Union européenne) et Stripe, listé dès maintenant pour le jour où la facturation ouvrira, inactif pendant le lancement. GitHub n'y figure plus : il ne traite aucune donnée client.
- La ligne de copyright du site, de la console et du menu de compte porte « © 2026 Jordan Monier ».

## Les documents

| Slug | Document | Ce qu'il couvre |
| --- | --- | --- |
| `terms` | Conditions d'utilisation | le contrat : le service, ce que la plateforme reçoit des machines et ce qu'elle peut y faire, le lancement gratuit, la responsabilité, le droit applicable |
| `licence` | Licence | le droit d'utiliser l'app et l'agent, le siège du lancement, les restrictions, qui signe l'app |
| `acceptable-use` | Usage acceptable | ce qui est interdit sur une machine gérée, les signalements d'abus et d'atteinte aux droits d'autrui, les sanctions |
| `privacy` | Confidentialité | ce qui est collecté, sur quelle base, où, combien de temps, les droits et les autorités de contrôle |
| `data-processing` | Traitement des données | l'accord de sous-traitance avec chaque organisation, les clauses contractuelles types |
| `billing` | Conditions d'abonnement | ce qui s'appliquera à l'ouverture de la facturation : essai, prix, renouvellement, paiement refusé, résiliation, remboursement, rétractation |
| `cookies` | Cookies | chaque cookie et chaque valeur du stockage local du site et de la console, et le retour sur le consentement |
| `sub-processors` | Sous-traitants | la liste datée, rendue par `<SubProcessors />`, et ce qui n'y figure pas |
| `security` | Sécurité | la divulgation responsable : où écrire, le périmètre, les règles, l'engagement de ne pas poursuivre, nos délais |
| `third-party` | Logiciels tiers | les composants libres de l'app et de l'agent, et leurs licences |
| `legal-notice` | Mentions légales | l'éditeur, le directeur de la publication, l'hébergeur, la société qui signe, la marque |
| `changes` | Historique | ce qui a changé, document par document, avec la date |

Un changement de fond dans un document change sa date dans `LEGAL_DOCUMENTS` et dans son frontmatter, et ajoute une entrée à l'historique, dans les deux langues. Le pied de page du site renvoie aux conditions, à la confidentialité, aux cookies, aux mentions légales et à l'index ; l'index se construit depuis la collection.

## Ce que les documents promettent, et que le code doit tenir

- **Le lancement gratuit.** Aucun paiement, aucune carte, un siège par organisation accordé par la plateforme (`BILLING_MODE=launch`). L'ouverture de la facturation est annoncée trente jours à l'avance par email, et rien n'est jamais prélevé sans un geste explicite du client.
- **Le siège du lancement est perpétuel.** Toute organisation qui a enrôlé une machine pendant le lancement garde un siège gratuit aussi longtemps que le service existe, attaché à l'organisation. À la fin du lancement, `reconcileLaunch` garde donc la ligne `launch` de ces organisations — `active`, sans échéance — au lieu de l'annuler, qu'elles paient déjà chez Stripe ou non ; seules celles qui n'ont rattaché aucune machine avant la fin du lancement voient leur lancement s'annuler. Pour une organisation qui paie aussi chez Stripe, `seatQuotaFor` ajoute ce siège à la quantité payée et la réconciliation ne le facture pas : une machine de moins à facturer.
- **Ce que la plateforme reçoit et peut faire.** Les conditions énumèrent exactement ce que l'agent envoie (enrôlement, heartbeat) et les trois leviers de la plateforme (droit d'usage, bloc de clés autorisées, version cible). Tout nouveau champ du heartbeat, tout nouveau pouvoir de `/agent/state`, doit d'abord être écrit dans les conditions et la politique de confidentialité, dans les deux langues.
- **Les sauvegardes.** La plateforme ne reçoit qu'une référence par sauvegarde — les champs de `BackupDeclaration`, énumérés dans les conditions — et le battement `BackupBeat`. La clé S3 reste au trousseau de l'app et dans `install.json` du serveur ; la clé privée des sauvegardes ne va que vers le serveur du client, en mémoire, le temps d'une restauration. Tout nouveau champ de la déclaration ou du battement s'écrit d'abord dans les conditions et la politique de confidentialité.
- **La mesure d'audience.** Le site mesure après consentement, sans cookie ni identifiant durable ; la seule valeur écrite est la réponse au bandeau (`pupitre_analytics`), et le lien « Mesure d'audience » du pied de page rouvre le bandeau. La console et l'app desktop n'envoient rien aujourd'hui ; le jour où elles mesurent, la politique de confidentialité se met à jour avec sa date, aux mêmes conditions : des noms d'événements, jamais un contenu, jamais rien des machines, jamais un identifiant durable sans accord. Le projet PostHog doit garder les événements douze mois et ne pas garder l'adresse IP : les deux réglages sont promis.
- **Les cookies.** La politique relative aux cookies nomme chaque cookie et chaque clé de stockage du site et de la console. Un cookie ou une clé de plus s'y écrit avant d'être posé.
- **Les remboursements.** Quatorze jours après le premier paiement et après chaque renouvellement annuel, remboursement complet sur demande ; c'est ce qui couvre le droit de rétractation des consommateurs européens. À tenir dès que la facturation ouvre.
- **La divulgation responsable.** Accusé de réception sous cinq jours ouvrés, date de publication convenue sous quatre-vingt-dix jours, aucune poursuite contre une recherche conforme. `/.well-known/security.txt` est généré au build depuis `LEGAL_CONTACTS.security` et expire cent quatre-vingts jours après : chaque déploiement du site le renouvelle.
- **Les délais.** Sessions de soixante jours, métriques des machines sur sept jours glissants, suppression programmée à sept jours (`DELETION_GRACE_DAYS`), suppression immédiate depuis la console, réponse aux demandes sous trente jours, violation notifiée sous soixante-douze heures.

## Ce que la source partagée contient

| Export | Ce qu'il porte |
| --- | --- |
| `LEGAL_ENTITY`, `isIncorporated()`, `copyrightHolder()` | l'éditeur, son statut, sa juridiction, et le nom à afficher au copyright |
| `CODE_SIGNING_ENTITY` | la société qui signe les builds de l'app |
| `LEGAL_CONTACTS` | `support`, `legal`, `privacy`, `security` |
| `PUPITRE_ORIGINS` | les deux origines : le site et la plateforme |
| `LEGAL_DOCUMENTS` | les douze documents, leur ordre, leur date |
| `SUB_PROCESSORS` | les sous-traitants, leur rôle et leur région, en fr et en en |

Les pages légales du site rendent les sous-traitants par `<SubProcessors />`, jamais par un tableau écrit à la main : la liste change à un seul endroit. L'hébergeur des mentions légales — Cloudflare, son adresse et son téléphone — s'écrit encore à la main dans la page, faute d'un export partagé.

Les tests de `apps/site/src/content/legal.test.ts` vérifient que chaque document existe dans les deux langues avec l'ordre et la date du registre, que les mentions légales nomment l'éditeur, le directeur de la publication, la société qui signe et les quatre contacts, et que chaque lien d'un document vers un autre vise un slug du registre dans sa propre langue.

## Le garde de publication

`apps/site/scripts/legal.ts` s'exécute au démarrage du build Astro et lit chaque page de `src/content/legal/` : un `TODO`, un `draft: true` dans le frontmatter ou un passage entre crochets fait échouer le build de production et `check:content`, et n'émet qu'un avertissement en local. Un build de production, c'est `PUPITRE_ENV=production`, que `build:production` pose.

## À l'immatriculation

1. Remplir `LEGAL_ENTITY` : raison sociale, forme, siège, numéro d'immatriculation, numéro fiscal, TVA le cas échéant, juridiction. Passer `status` à `incorporated` : le copyright passe alors de Jordan Monier à la société.
2. Acter l'apport du projet à la société — code, marque, noms de domaine, comptes — et remplacer, dans la licence, les conditions et les mentions légales, les phrases qui disent qu'il appartient personnellement à Jordan Monier. Mettre à jour `LICENSE`. Les mentions légales prennent alors la raison sociale, la forme, le siège, les numéros et le capital.
3. Annoncer le changement d'entité par email aux comptes actifs trente jours avant, comme les conditions le promettent, puis mettre à jour la date des documents.
4. Si la société signe elle-même l'app, remplacer `CODE_SIGNING_ENTITY` et la section « Qui signe l'app » de la licence.
5. Le jour où la facturation ouvre : annoncer trente jours avant, passer `BILLING_MODE` à `stripe`, et décider comment Stripe rend gratuite la machine du lancement à une organisation qui paie d'autres sièges.
