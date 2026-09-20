# Légal

Ce que le dépôt dit de l'éditeur, où il le dit, et ce qui change le jour où une société existe. Une seule source : [`packages/shared/src/legal/index.ts`](../packages/shared/src/legal/index.ts). Le site, la console et l'app desktop la lisent ; aucun d'eux ne réécrit un nom, une adresse ni une adresse email de contact.

## L'état actuel

Le service est ouvert, gratuit pendant le lancement, et édité par une personne physique : Jordan Monier, résidant au Maroc. Il n'y a pas de société ; le dépôt ne revendique donc aucune raison sociale, aucune forme juridique, aucun siège et aucun numéro. Le projet — code, marque, noms de domaine, plateforme — lui appartient personnellement, et les documents disent que l'entité responsable, le mode d'encaissement et le prestataire de paiement pourront changer, avec trente jours de préavis par email. Le plan d'immatriculation vit hors dépôt, dans [`incorporation.pdf`](./incorporation.pdf).

Ce que la source partagée fixe :

- `LEGAL_ENTITY.status` vaut `individual`. `owner` et `publicationDirector` portent « Jordan Monier », `jurisdiction` le Maroc — le droit qui régit les conditions et les tribunaux compétents — et les champs d'identité d'une société valent `null`. `copyrightHolder()` rend ce nom, et rendra la raison sociale le jour où la société sera immatriculée.
- `CODE_SIGNING_ENTITY` nomme React Consulting SARL AU, la société marocaine dont les certificats signent les builds macOS et Windows de l'app. Elle signe et ne fait rien d'autre : la licence le dit, elle n'est ni l'éditeur ni partie au contrat.
- `LEGAL_DOCUMENTS` porte les cinq documents, leur ordre et leur date. Ils sont publiés, sans brouillon ni passage à compléter.
- `SUB_PROCESSORS` ne nomme que ceux qui touchent une donnée personnelle : Cloudflare (hébergement, base de données et fichiers en Amérique du Nord, emails), PostHog (mesure d'audience, événements stockés dans l'Union européenne) et Stripe, listé dès maintenant pour le jour où la facturation ouvrira, inactif pendant le lancement. GitHub n'y figure plus : il ne traite aucune donnée client.
- La ligne de copyright du site, de la console et du menu de compte porte « © 2026 Jordan Monier ».

## Ce que les documents promettent, et que le code doit tenir

- **Le lancement gratuit.** Aucun paiement, aucune carte, un siège par organisation accordé par la plateforme (`BILLING_MODE=launch`). L'ouverture de la facturation est annoncée trente jours à l'avance par email, et rien n'est jamais prélevé sans un geste explicite du client.
- **Le siège du lancement est perpétuel.** Toute organisation qui a enrôlé une machine pendant le lancement garde un siège gratuit aussi longtemps que le service existe, attaché à l'organisation. À la fin du lancement, `reconcileLaunch` garde donc la ligne `launch` de ces organisations — `active`, sans échéance — au lieu de l'annuler ; seules celles qui n'ont jamais enrôlé de machine, ou qui paient déjà chez Stripe, voient leur lancement s'annuler. Une organisation qui paie chez Stripe garde la promesse à honorer côté Stripe le jour où la facturation ouvre : une machine de moins à facturer.
- **Ce que la plateforme reçoit et peut faire.** Les conditions énumèrent exactement ce que l'agent envoie (enrôlement, heartbeat) et les trois leviers de la plateforme (droit d'usage, bloc de clés autorisées, version cible). Tout nouveau champ du heartbeat, tout nouveau pouvoir de `/agent/state`, doit d'abord être écrit dans les conditions et la politique de confidentialité, dans les deux langues.
- **La mesure d'audience.** Le site mesure après consentement, sans cookie ni identifiant durable. La console et l'app desktop n'envoient rien aujourd'hui ; le jour où elles mesurent, la politique de confidentialité se met à jour avec sa date, aux mêmes conditions : des noms d'événements, jamais un contenu, jamais rien des machines, jamais un identifiant durable sans accord. La durée annoncée est de douze mois : le projet PostHog doit être configuré ainsi.
- **Les délais.** Sessions de soixante jours, métriques des machines sur sept jours glissants, suppression programmée à sept jours (`DELETION_GRACE_DAYS`), suppression immédiate depuis la console, réponse aux demandes sous trente jours, violation notifiée sous soixante-douze heures.

## Ce que la source partagée contient

| Export | Ce qu'il porte |
| --- | --- |
| `LEGAL_ENTITY`, `isIncorporated()`, `copyrightHolder()` | l'éditeur, son statut, sa juridiction, et le nom à afficher au copyright |
| `CODE_SIGNING_ENTITY` | la société qui signe les builds de l'app |
| `LEGAL_CONTACTS` | `support`, `legal`, `privacy`, `security` |
| `PUPITRE_ORIGINS` | les deux origines : le site et la plateforme |
| `LEGAL_DOCUMENTS` | les cinq documents, leur ordre, leur date |
| `SUB_PROCESSORS` | les sous-traitants, leur rôle et leur région, en fr et en en |

Les pages légales du site rendent les sous-traitants par `<SubProcessors />`, jamais par un tableau écrit à la main : la liste change à un seul endroit.

## Le garde de publication

`apps/site/scripts/legal.ts` s'exécute au démarrage du build Astro et lit chaque page de `src/content/legal/` : un `TODO`, un `draft: true` dans le frontmatter ou un passage entre crochets fait échouer le build de production et `check:content`, et n'émet qu'un avertissement en local. Un build de production, c'est `PUPITRE_ENV=production`, que `build:production` pose.

## À l'immatriculation

1. Remplir `LEGAL_ENTITY` : raison sociale, forme, siège, numéro d'immatriculation, numéro fiscal, TVA le cas échéant, juridiction. Passer `status` à `incorporated` : le copyright passe alors de Jordan Monier à la société.
2. Acter l'apport du projet à la société — code, marque, noms de domaine, comptes — et remplacer, dans la licence et les conditions, les phrases qui disent qu'il appartient personnellement à Jordan Monier. Mettre à jour `LICENSE`.
3. Annoncer le changement d'entité par email aux comptes actifs trente jours avant, comme les conditions le promettent, puis mettre à jour la date des documents.
4. Si la société signe elle-même l'app, remplacer `CODE_SIGNING_ENTITY` et la section « Qui signe l'app » de la licence.
5. Le jour où la facturation ouvre : annoncer trente jours avant, passer `BILLING_MODE` à `stripe`, et décider comment Stripe rend gratuite la machine du lancement à une organisation qui paie d'autres sièges.
