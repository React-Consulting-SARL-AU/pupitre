# Refonte de la gestion de la plateforme — septembre 2026

Branche `admin-overhaul`, 86 commits au-dessus de l'instantané `a35d70d7`. Produite par trois vagues d'agents (implémentation, interfaces, relecture puis correction) sur des worktrees séparés, fusionnées à la main.

## Ce qui est livré

- **Socle** : `AsyncDataTable`, `ConfirmFormDialog`, `PageTabs`, `DangerZone`, `RowActionsMenu`, `useListSearch` (état de liste dans l'adresse), aperçu en listes de travail, recherche globale `Cmd+K` (`GET /admin/search`).
- **Comptes** : suspendre (avec échéance), désactiver, supprimer à sept jours puis purger, révoquer sessions et appareils, renvoyer la vérification ; états `active | suspended | deactivated | deleting` ; refus de connexion sur tous les chemins d'auth ; workflow `PurgeDeletions`.
- **Organisations** : suspendre, fermer, rouvrir, supprimer à sept jours, renommer, transférer la propriété, retirer un membre ; bandeau client ; emails aux propriétaires ; `org_pupitre` et ses membres protégés sur chaque geste.
- **Serveurs** : canal, fermeture des alertes, fiche enrichie (usage sur sept jours, appareils révoqués), filtres et tris.
- **Abonnements** : fiche avec sièges, dérive, événements Stripe, lien Stripe ; prolongation d'essai, reprise d'une résiliation en fin de période, filtres `live`, `drifted`, `product=stripe`.
- **Affiliation** : modification complète, suppression protégée par la provenance, partenaire et notes, compteur de clics par jour sans IP (`POST /affiliate/:code/hit` + beacon du site).
- **Boîte v2** : table `MailMailbox` (création de `contact@`, `jordan@`…), notes internes, brouillons, activité par fil, réponses types, lien organisation, lot, raccourcis, temps réel par Durable Object `InboxRealtime`, lecture journalisée des boîtes sensibles.

## Migrations D1 à appliquer

`0008_account_lifecycle`, `0009_mail_v2`, `0010_affiliate_partner_clicks`, `0011_subscription_cancel_at_period_end_stripe_event_subscription`. Aucune n'est encore appliquée en production.

## Ce qui change hors code

- `wrangler.jsonc` : binding Workflow `PURGE_DELETIONS`, Durable Object `INBOX_REALTIME` (migration `v1`, `new_sqlite_classes`).
- `apps/site/public/_headers` : `connect-src` accepte `app.pupitre.studio` (beacon des clics).
- `MAIL_SENDER_ADDRESSES` disparaît : les expéditeurs sont les boîtes activées qui répondent.

## Avant la fusion dans `staging`

1. Le premier commit (`a35d70d7`) est un instantané du travail non commité d'une autre session (abonnements `granted`, retrait de serveur, révocation d'appareil). Une fois ce travail commité sur `staging`, rebaser : `git rebase --onto staging a35d70d7 admin-overhaul`.
2. Relire les décisions prises par l'orchestrateur faute d'arbitrage : sessions et appareils d'un membre de l'équipe non révocables depuis la plateforme (409) ; notes et brouillons de la boîte réservés au rôle `admin` ; volets du fil repliables à toute largeur.
3. Deux points laissés au propriétaire : le comptage des sessions `stripe_events` pour les factures réelles (forme `parent.subscription_details.subscription` couverte, à vérifier sur un vrai événement) ; l'absence d'usurpation de session est définitive.
