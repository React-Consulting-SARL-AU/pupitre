---
name: spec
description: "Écrire ou modifier la spécification d'une tâche dans `docs/plans/README.md` — le gabarit, un identifiant stable, des critères d'acceptation observables, les tests d'acceptation avant le code, les blocages et les tâches de contrat. Ce fichier ne porte que ce qui reste à faire : une tâche livrée en sort, l'historique git en tient le registre. À utiliser quand le propriétaire demande une nouvelle tâche, un découpage, une reformulation de spec, ou quand une tâche en cours découvre un besoin hors de son périmètre."
---

# Spécifier une tâche

Les documents sont la spécification ; le code les suit (`docs/README.md`). Une tâche est ce qu'un agent prend en une session : une spec courte, des critères d'acceptation, un périmètre fermé. Elle se lit sans le contexte de la conversation qui l'a produite.

## Fichiers gouvernés

| Fichier | Rôle |
| --- | --- |
| `docs/plans/README.md` | le gabarit, le protocole de démarrage, et **les seules tâches non terminées** |
| `docs/contracts/*.md` | ce qu'une tâche de contrat modifie ; ce qu'une tâche d'implémentation lit |
| `docs/decisions/` | ce qu'une tâche ne remet pas en cause sans blocage |

Il n'y a **pas** de fichier de suivi. Une tâche livrée est retirée de `docs/plans/README.md` dans la passe qui la livre ; son identifiant vit dans le sujet de son commit, et `git log --oneline --grep "<ID>"` la retrouve. Un document ne conserve pas ce qui est fait.

## Le gabarit

Tel qu'il est dans `docs/plans/README.md`, sans variante :

```
### APP-04 — Écran d'inspection
Lot 2 · dépend de AGT-02, INF-04 · workspace apps/desktop

But. Une phrase.
Périmètre. Ce que la tâche livre, fichier par fichier si utile.
Hors périmètre. Ce que la tâche ne fait pas, même si c'est tentant.
Critères d'acceptation.
1. …
2. …
Tests. Où ils vivent, ce qu'ils prouvent.
```

- **Titre** : `### <PRÉFIXE>-<NN> — <nom>`. Le nom dit ce qui existe quand la tâche est faite, en français, sans verbe à l'infinitif (« Écran d'inspection », pas « Créer l'écran d'inspection »).
- **Ligne d'en-tête** : le lot, les dépendances par identifiant, le ou les workspaces. Une tâche sans dépendance l'écrit : `aucune dépendance`.
- **But** : une phrase, celle qu'on lit pour décider si la tâche vaut la peine.
- **Périmètre** : les fichiers ou dossiers livrés, les commandes, les routes, les modules, avec leurs chemins réels. Ce qui est nommé ici est ce que la revue vérifie.
- **Hors périmètre** : ce que l'agent va vouloir faire et ne doit pas faire. Un besoin qui apparaît ici devient une autre tâche.
- **Critères d'acceptation** : numérotés, observables, vérifiables par une commande, un test ou une manipulation décrite. Un critère dit un résultat (`ssh dev@staging true` fonctionne, `grep` ne renvoie rien, la page existe en `/` et `/fr`), jamais une intention (« le code est propre »). Chiffres quand il y en a : secondes, Mo, nombre d'appels.
- **Tests** : le chemin des fichiers de test et ce que chacun prouve. Un critère sans test dit pourquoi (test manuel documenté, dashboard externe).

Une tâche courte peut omettre « Hors périmètre » ou « Tests » quand ils sont évidents ; elle n'omet jamais « Critères d'acceptation ».

## Où l'ajouter

Tout vit dans la section « Ce qui reste » de `docs/plans/README.md`, dans l'ordre d'arrivée. Le préfixe dit le chantier — `INF` le socle et les contrats, `AGT` l'agent Go, `APP` l'app desktop, `PLT` la plateforme, `MKT` le site — il ne dit plus dans quel fichier écrire. Une tâche qui touche deux workspaces est deux tâches, liées par leurs dépendances. Une tâche qui modifie `packages/shared` ou `docs/contracts/` est une **tâche de contrat** : elle vit dans le plan du consommateur principal, son périmètre nomme le fichier de contrat et le fichier de `packages/shared/src/`, et les tâches d'implémentation en dépendent.

## Identifiants

- `<PRÉFIXE>-<NN>`, deux chiffres, le suivant du plus grand identifiant existant du préfixe, même si ce dernier est abandonné.
- Un identifiant est stable : on ne renumérote jamais, on ne réutilise jamais un identifiant d'une tâche supprimée. Une tâche abandonnée sort du fichier ; la raison va dans le commit qui la retire.
- Une tâche qui grossit se découpe : l'ancienne garde son numéro et son premier morceau, les autres morceaux prennent les identifiants suivants disponibles.

## Ce qui remplace le suivi

L'état d'une tâche ne s'écrit nulle part : une tâche présente dans `docs/plans/README.md` reste à faire, une tâche absente est faite ou abandonnée. `git log --oneline` donne le reste, chaque sujet de commit portant l'identifiant.

Ce qu'une tâche livrée laisse derrière elle, quand elle laisse quelque chose : une ligne dans son commit, et — si un travail reste au propriétaire — une tâche ouverte qui le nomme.

## Critères d'acceptation, puis tests, puis code

La spec précède le code, et les tests précèdent le code (`CLAUDE.md`, « Travailler par tâche » ; décision 0010). L'agent qui prend une tâche :

1. traduit chaque critère d'acceptation en un test qui échoue, au chemin que la section « Tests » indique ;
2. implémente jusqu'à ce que les tests passent ;
3. ne touche pas aux critères. Un critère faux ou impossible se signale au propriétaire et attend sa décision.

Un critère qui ne peut pas s'écrire en test se reformule jusqu'à pouvoir l'être, ou dit explicitement « test manuel : … ».

## Blocages et besoins de contrat

Une tâche qui découvre un besoin hors de son périmètre s'arrête et l'écrit dans son rapport au propriétaire : ce qui bloque en une phrase, et de qui vient la décision. Le propriétaire crée la tâche de contrat, qui rejoint « Ce qui reste ». Une tâche ne modifie jamais un contrat ou une décision « au fil de l'eau ».

Une tâche qui pense qu'une décision de `docs/decisions/` est fausse la lit d'abord, puis ouvre un blocage ; elle ne l'améliore pas.

## Conventions d'écriture

- Français, présent, phrases courtes. Un document dit ce qui est vrai, pas ce qui a été envisagé.
- Chemins réels du dépôt, en code : `apps/desktop/src/main/agent-client.ts`, pas « le client de l'agent ».
- Identifiants de commandes, de routes et de modules tels qu'ils sont dans les contrats : `project.up`, `POST /servers/enroll`, `db.postgres`.
- Dates absolues.
- Un document qui en contredit un autre est un bug : les deux se corrigent dans la même passe, ou le désaccord devient un blocage.

## Avant de rendre la spec

1. Le gabarit est respecté ; le titre, le lot, les dépendances et le workspace sont là.
2. Chaque critère est observable et numéroté ; chaque critère a son test ou dit pourquoi il n'en a pas.
3. Le périmètre nomme des fichiers réels ; le hors périmètre nomme les tentations.
4. L'identifiant est le suivant du préfixe, et n'a jamais servi : `grep -rn "<ID>" docs/` est vide **et** `git log --oneline --grep "<ID>"` aussi — un identifiant déjà livré ne se réutilise pas.
5. La tâche est dans « Ce qui reste » de `docs/plans/README.md`.
6. Rien dans la spec ne contredit `CLAUDE.md`, un contrat, une décision ; sinon, blocage.
