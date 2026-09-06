# Plans d'implémentation

Une tâche est ce qu'un agent prend en une session : une spec courte, des critères d'acceptation, un périmètre fermé.

Ce fichier ne porte que **ce qui reste à faire**. Les tâches livrées ne sont pas conservées : l'historique git en tient le registre, et une spec accomplie ne fait que vieillir. `git log --oneline` donne, pour chaque tâche, son identifiant dans le sujet du commit.

## Anatomie d'une tâche

```
### APP-04 — Écran d'inspection
dépend de AGT-02, INF-04 · workspace apps/desktop

But. Une phrase.
Périmètre. Ce que la tâche livre, fichier par fichier si utile.
Hors périmètre. Ce que la tâche ne fait pas, même si c'est tentant.
Critères d'acceptation.
1. …
2. …
Tests. Où ils vivent, ce qu'ils prouvent.
```

Les identifiants sont stables : on ne renumérote jamais, on ne réutilise jamais, on ajoute.

## Démarrer un agent sur une tâche

Un worktree par tâche, une branche nommée `<type>/<ID>-<slug>` :

```bash
git worktree add ../pupitre-APP-04 -b feat/APP-04-inspection
cd ../pupitre-APP-04 && claude
```

Prompt de départ :

```
Lis CLAUDE.md, le CLAUDE.md du workspace concerné, docs/plans/README.md et les contrats listés par la tâche.
Prends la tâche <ID>. Écris d'abord les tests d'acceptation, puis implémente.
Reste dans le périmètre et dans le workspace.
Quand lint, typecheck et tests sont verts, arrête-toi. Ne commit et ne push que si on te le demande.
```

## Parallélisme

- Deux agents ne travaillent jamais sur le même workspace en même temps, sauf sur des tâches explicitement marquées indépendantes.
- Les contrats (`packages/shared`, `docs/contracts/`) se modifient par une tâche de contrat, jamais depuis une tâche d'implémentation. Une tâche qui découvre un besoin de contrat s'arrête et le signale au propriétaire, qui crée la tâche.
- Une tâche finie disparaît de ce fichier. Une tâche qui découvre un travail hors de son périmètre l'y ajoute.

## Ce qui reste

Quatre de ces cinq tâches attendent une action du propriétaire, hors du dépôt : rien dans le code ne les débloquera.

### INF-24 — Identité légale partagée, pages légales en brouillon
Lot 0 · aucune dépendance · `packages/shared`, `apps/site`, `apps/web`, `apps/desktop`, `docs`

But. Le dépôt dit une seule fois qui édite Pupitre, et les pages légales se publient en brouillon tant que la société n'existe pas.

Périmètre. `packages/shared/src/legal/` devient la source unique : étape du projet (`development` ou `public`), éditeur aux champs vides et son libellé d'attente, contacts, origines du site et de la plateforme, registre des cinq documents légaux, sous-traitants bilingues, avertissement de développement en fr et en en. `apps/site` : `LegalNotice` en tête de chaque page légale et de l'index, `SubProcessors` rendu dans la confidentialité et le DPA, les dix pages rédigées en brouillon avec des passages entre crochets là où l'information légale ou fiscale manque, la garde `scripts/legal.ts` adossée à l'étape du projet, le pied de page. `apps/web` : pied de page de la console et `SITE_URL`. `apps/desktop` : `DEFAULT_PLATFORM_URL`. `docs/legal.md` : l'état, la source, la garde, et la liste de ce qui reste à remplir à l'immatriculation.

Hors périmètre. L'immatriculation elle-même, la rédaction définitive, la relecture par un avocat, le DPA téléchargeable et signé.

Critères d'acceptation.
1. Aucun fichier du dépôt ne revendique « Pupitre LLC » ni aucune autre forme juridique.
2. Les dix pages légales portent l'avertissement en tête, dans leur langue, et disent qu'elles n'engagent personne.
3. Le build de production refuse un `TODO` légal à toute étape, et refuse un brouillon ou un passage à compléter dès que l'étape vaut `public`.
4. Passer l'étape à `public` sans éditeur immatriculé fait échouer le build de production.
Tests. `packages/shared/src/legal/index.test.ts`, `apps/site/scripts/legal.test.ts`, `apps/site/src/content/legal.test.ts`, `apps/site/src/components/legal-notice.test.ts`.

### APP-15 — Serveurs distants et organisations
Lot 3 · dépend de APP-14, PLT-10 · `apps/desktop`

Périmètre. `GET /me/servers` fusionné à la liste locale, sélecteur d'organisation, première ouverture d'un serveur attribué (attente de `key_ready`, puis assistant de personnalisation), révocation vue côté app.
Critères d'acceptation. Un membre invité voit son serveur attribué et s'y connecte sans saisir d'adresse ni de clé.

### PLT-14 — Déploiement Cloudflare Builds, staging et production
Lot 3 · dépend de PLT-08 · `apps/web`, dashboards

Périmètre. `wrangler.jsonc` avec `secrets.required`, `scripts/check-worker-secrets.ts`, deux environnements, migrations au build, domaines `staging-app.pupitre.studio` et `app.pupitre.studio`, page de statut minimale `/status` sur les heartbeats, observabilité Workers.
Critères d'acceptation. Un push sur `main` déploie le staging ; un tag déploie la production ; un secret manquant refuse le déploiement avec son nom.

**Porte du lot 3** : un inconnu paie en mode test, télécharge, enrôle son VPS et travaille, sans écrire au propriétaire.

### MKT-07 — Pages légales
Lot S · dépend de MKT-01 · `apps/site`

Périmètre. Conditions d'utilisation, licence, politique d'usage acceptable, confidentialité, DPA téléchargeable, mentions de la LLC. Contenu fourni par le propriétaire ; la tâche livre les pages et leur structure, avec des marqueurs `TODO` visibles au build tant que le texte n'est pas là.
Critères d'acceptation. Le build échoue en production s'il reste un `TODO` légal.

État. INF-24 a rédigé les dix brouillons et posé l'identité légale partagée ; voir `docs/legal.md`. Restent au propriétaire : les textes définitifs, la relecture par un avocat, le DPA téléchargeable et signable, et le passage de `draft: true` à `false` sur les dix pages — le garde vérifie les deux.

### MKT-09 — Déploiement Cloudflare Pages
Lot S · dépend de MKT-01 · `apps/site`, dashboard

Périmètre. Projet Pages relié au dépôt, `staging.pupitre.studio` sur les PR, `pupitre.studio` sur `main`, en-têtes de sécurité (`CSP`, `HSTS`), redirections `www` et `/fr/` trailing.
Critères d'acceptation. Une PR obtient une URL de prévisualisation ; `main` publie en moins de trois minutes.

### PLT-29 — La plateforme passe aux régions américaines
Lot 3 · dépend de PLT-14 · `apps/web`, `packages/db`, `apps/site`, dashboards

But. La société qui éditera Pupitre sera américaine : la plateforme est hébergée aux États-Unis avant d'accueillir un client.

Périmètre. Projet Neon recréé ou migré en région américaine, branches `production` et `staging` avec lui ; `placement.region` du Worker dans `apps/web/wrangler.jsonc` aligné sur la nouvelle région, aux trois endroits ; instance PostHog américaine et `PUBLIC_POSTHOG_HOST` du site avec elle ; juridiction des compartiments R2 vérifiée. `packages/shared/src/legal` : les régions des sous-traitants disent la région réelle une fois la migration faite. `apps/site/src/content/legal/**` : les sections « Sous-traitants » et « Transferts » perdent leur phrase de migration. `docs/monorepo.md` et `docs/legal.md` suivent.

Hors périmètre. L'immatriculation, le choix de l'État, et la rédaction définitive des clauses de transfert.

Critères d'acceptation.
1. Aucune région européenne dans `wrangler.jsonc`, dans le projet Neon, ni dans les pages légales.
2. Le Worker et sa base sont dans la même région, et la console répond aussi vite qu'avant la migration.
3. Aucune donnée perdue : la branche `production` migrée porte les mêmes lignes que l'ancienne, vérifié avant bascule.
Tests. Migrations rejouées sur la nouvelle branche, suite d'intégration de `packages/api` verte, et un appel de bout en bout depuis la console déployée.
