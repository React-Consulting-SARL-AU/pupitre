# Légal

Ce que le dépôt dit de l'éditeur, où il le dit, et ce qui reste à remplir. Une seule source : [`packages/shared/src/legal/index.ts`](../packages/shared/src/legal/index.ts). Le site, la console et l'app desktop la lisent ; aucun d'eux ne réécrit un nom, une adresse ni une adresse email de contact.

## L'état actuel

Depuis le 1er octobre 2026 ([décision 0018](./decisions/0018-source-disponible-et-gratuit.md)), Pupitre est édité par **React Consulting SARL AU**, société marocaine représentée par son gérant, Jordan Monier, qui est aussi le directeur de la publication. La société détient le code, la marque, les noms de domaine et la plateforme, publie le code source sous licence Apache 2.0 assortie de la Commons Clause ([`LICENSE`](../LICENSE), [`NOTICE`](../NOTICE)), et paie l'hébergement de la plateforme. Le service est gratuit jusqu'à trois serveurs par organisation ; au-delà, une licence est accordée sur demande, sans paiement.

Ce que la source partagée fixe :

- `LEGAL_ENTITY.status` vaut `incorporated`, `legalName` « React Consulting SARL AU », `form` « SARL AU », `jurisdiction` le Maroc — le droit qui régit les conditions et les tribunaux compétents —, `owner` et `publicationDirector` « Jordan Monier ». `copyrightHolder()` rend la raison sociale. **Les numéros restent `null`** : `registrationNumber` (RC), `taxId` (IF), `vatNumber` (ICE ou TVA) et `registeredAddress` (siège) attendent le propriétaire ; les mentions légales n'en écrivent aucun tant qu'ils manquent, et n'en inventent aucun.
- `CODE_SIGNING_ENTITY` nomme la même société, dont les certificats signent les builds macOS et Windows de l'app.
- `LEGAL_DOCUMENTS` porte les douze documents, leur ordre et leur date. Ils sont publiés, sans brouillon ni passage à compléter.
- `SUB_PROCESSORS` ne nomme que ceux qui touchent une donnée personnelle : Cloudflare (hébergement, base de données et fichiers en Amérique du Nord, emails), PostHog (mesure d'audience, événements stockés dans l'Union européenne) et Stripe, listé pour le jour où des licences se vendraient, à qui rien n'est envoyé aujourd'hui.
- La ligne de copyright du site, de la console et du menu de compte porte « © 2026 React Consulting SARL AU ».

## Les documents

| Slug | Document | Ce qu'il couvre |
| --- | --- | --- |
| `terms` | Conditions d'utilisation | le contrat : le service, ce que la plateforme reçoit des machines et ce qu'elle peut y faire, ce qui est gratuit, le code source public, la responsabilité, le droit applicable |
| `licence` | Licence | la licence du code (Apache 2.0 + Commons Clause, renvoi au `LICENSE` du dépôt), ce qu'elle permet et interdit, le nom et le logo, le droit d'utiliser la plateforme hébergée, qui signe l'app |
| `acceptable-use` | Usage acceptable | ce qui est interdit sur une machine gérée, les signalements d'abus et d'atteinte aux droits d'autrui, les sanctions |
| `privacy` | Confidentialité | ce qui est collecté, sur quelle base, où, combien de temps, les droits et les autorités de contrôle |
| `data-processing` | Traitement des données | l'accord de sous-traitance avec chaque organisation, les clauses contractuelles types |
| `billing` | Serveurs gratuits et licences | gratuit jusqu'à trois serveurs, licence accordée sur demande au-delà, aucun paiement aujourd'hui. Le slug reste `billing` : il vit dans `LEGAL_DOCUMENT_SLUGS` et des liens publiés y mènent |
| `cookies` | Cookies | chaque cookie et chaque valeur du stockage local du site et de la console, et le retour sur le consentement |
| `sub-processors` | Sous-traitants | la liste datée, rendue par `<SubProcessors />`, et ce qui n'y figure pas |
| `security` | Sécurité | la divulgation responsable : où écrire, le périmètre, les règles, l'engagement de ne pas poursuivre, nos délais |
| `third-party` | Logiciels tiers | les composants libres de l'app et de l'agent, et leurs licences |
| `legal-notice` | Mentions légales | l'éditeur, le directeur de la publication, l'hébergeur, la société qui signe, la marque et le code |
| `changes` | Historique | ce qui a changé, document par document, avec la date |

Un changement de fond dans un document change sa date dans `LEGAL_DOCUMENTS` et dans son frontmatter, et ajoute une entrée à l'historique, dans les deux langues. Le pied de page du site renvoie aux conditions, à la confidentialité, aux cookies, aux mentions légales et à l'index ; l'index se construit depuis la collection. Le nombre de serveurs gratuits ne s'écrit jamais à la main dans une page : elle importe `FREE_SERVERS` de `@pupitre/shared/plans`.

## Ce que les documents promettent, et que le code doit tenir

- **Gratuit jusqu'à trois serveurs.** Aucun paiement, aucune carte, aucune limite de durée sur les `FREE_SERVERS` premiers serveurs d'une organisation. Si des licences payantes étaient proposées un jour, ce serait annoncé trente jours à l'avance par email, décrit dans `billing` avant d'être vendu, et rien ne serait prélevé sans un geste explicite du client. Tant que c'est vrai, `BILLING_MODE` vaut `off`.
- **La licence au-delà.** Accordée par l'équipe (produit `granted`), sans paiement. Une licence qui prend fin alors que l'organisation tient plus que ses serveurs gratuits ouvre sept jours de tolérance, puis le mode restreint ; rien n'est effacé.
- **La licence du code.** Apache 2.0 + Commons Clause : utiliser, modifier, auto-héberger, redistribuer avec les mentions ; pas de revente de Pupitre ni d'un service qui en tire l'essentiel de sa valeur ; ni le nom ni le logo ne sont concédés. Le texte qui engage est `LICENSE` ; la page `licence` le résume et y renvoie par `SOURCE_LICENSE_URL` (`apps/site/src/lib/urls.ts`).
- **Ce que la plateforme reçoit et peut faire.** Les conditions énumèrent exactement ce que l'agent envoie (enrôlement, heartbeat) et les trois leviers de la plateforme (licence, bloc de clés autorisées, version cible). Tout nouveau champ du heartbeat, tout nouveau pouvoir de `/agent/state`, doit d'abord être écrit dans les conditions et la politique de confidentialité, dans les deux langues.
- **Les sauvegardes.** La plateforme ne reçoit qu'une référence par sauvegarde — les champs de `BackupDeclaration`, énumérés dans les conditions — et le battement `BackupBeat`. La clé S3 reste au trousseau de l'app et dans `install.json` du serveur ; la clé privée des sauvegardes ne va que vers le serveur du client, en mémoire, le temps d'une restauration. Tout nouveau champ de la déclaration ou du battement s'écrit d'abord dans les conditions et la politique de confidentialité.
- **Les liens d'affiliation.** Suivi seulement : le code est lu à l'inscription, la plateforme compte les visites, les inscriptions et les serveurs enrôlés par les organisations amenées. Aucune offre, aucune récompense ne s'y attache ; en ajouter une change d'abord la politique de confidentialité.
- **La mesure d'audience.** Le site mesure après consentement, sans cookie ni identifiant durable ; la seule valeur écrite est la réponse au bandeau (`pupitre_analytics`), et le lien « Mesure d'audience » du pied de page rouvre le bandeau. La console et l'app desktop n'envoient rien aujourd'hui ; le jour où elles mesurent, la politique de confidentialité se met à jour avec sa date, aux mêmes conditions : des noms d'événements, jamais un contenu, jamais rien des machines, jamais un identifiant durable sans accord. Le projet PostHog doit garder les événements douze mois et ne pas garder l'adresse IP : les deux réglages sont promis.
- **Les cookies.** La politique relative aux cookies nomme chaque cookie et chaque clé de stockage du site et de la console. Un cookie ou une clé de plus s'y écrit avant d'être posé.
- **La divulgation responsable.** Accusé de réception sous cinq jours ouvrés, date de publication convenue sous quatre-vingt-dix jours, aucune poursuite contre une recherche conforme. `/.well-known/security.txt` est généré au build depuis `LEGAL_CONTACTS.security` et expire cent quatre-vingts jours après : chaque déploiement du site le renouvelle.
- **Les délais.** Sessions de soixante jours, métriques des machines sur sept jours glissants, suppression programmée à sept jours (`DELETION_GRACE_DAYS`), suppression immédiate depuis la console, réponse aux demandes sous trente jours, violation notifiée sous soixante-douze heures.

## Ce que la source partagée contient

| Export | Ce qu'il porte |
| --- | --- |
| `LEGAL_ENTITY`, `isIncorporated()`, `copyrightHolder()` | l'éditeur, son statut, sa juridiction, et le nom à afficher au copyright |
| `CODE_SIGNING_ENTITY` | la société qui signe les builds de l'app |
| `LEGAL_CONTACTS` | `support`, `legal`, `privacy`, `security` |
| `PUPITRE_ORIGINS` | les origines : le site, la plateforme, les téléchargements |
| `LEGAL_DOCUMENTS` | les douze documents, leur ordre, leur date |
| `SUB_PROCESSORS` | les sous-traitants, leur rôle et leur région, en fr et en en |

Les pages légales du site rendent les sous-traitants par `<SubProcessors />`, jamais par un tableau écrit à la main : la liste change à un seul endroit. L'hébergeur des mentions légales — Cloudflare, son adresse et son téléphone — s'écrit encore à la main dans la page, faute d'un export partagé.

Les tests de `apps/site/src/content/legal.test.ts` vérifient que chaque document existe dans les deux langues avec l'ordre et la date du registre ; que les conditions, la licence, la confidentialité et le traitement des données nomment `copyrightHolder()` ; que la licence nomme Apache et la Commons Clause et renvoie au `LICENSE` du dépôt ; qu'aucun document ne promet plus de lancement, d'essai ni de place gardée pour de bon ; que les mentions légales nomment l'éditeur, le directeur de la publication, la société qui signe et les quatre contacts ; et que chaque lien d'un document vers un autre vise un slug du registre dans sa propre langue.

## Le garde de publication

`apps/site/scripts/legal.ts` s'exécute au démarrage du build Astro et lit chaque page de `src/content/legal/` : un `TODO`, un `draft: true` dans le frontmatter ou un passage entre crochets fait échouer le build de production et `check:content`, et n'émet qu'un avertissement en local. Un build de production, c'est `PUPITRE_ENV=production`, que `build:production` pose.

## Ce qui reste à faire

1. Remplir dans `LEGAL_ENTITY` le siège, le RC, l'IF et l'ICE de React Consulting SARL AU, puis les écrire dans les mentions légales des deux langues, avec le capital.
2. Annoncer par email aux comptes actifs le changement d'éditeur et de conditions du 1er octobre 2026 — la place gardée du lancement disparaît au profit des trois serveurs gratuits —, comme les conditions le promettent pour un changement défavorable.
3. Le jour où des licences se vendent : décrire l'offre dans `billing` et la politique de confidentialité, annoncer trente jours avant, puis passer `BILLING_MODE` à `stripe`.
