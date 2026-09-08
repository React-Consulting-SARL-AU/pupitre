# Signer l'installateur Windows par Azure Trusted Signing

Statut : **à faire**, quand le propriétaire aura ouvert le compte Azure.
Ouverte le 2026-09-07. Bloque : rien. Dégrade : le premier lancement sur Windows.

## Pourquoi

Le pipeline de release signe déjà macOS (Developer ID puis notarisation) et signe tous les artefacts avec la clé Ed25519 de release. Windows n'a pas d'équivalent gratuit : sans certificat reconnu, SmartScreen affiche un écran bleu « Windows a protégé votre ordinateur » au premier lancement de l'installateur, et il faut cliquer sur *Informations complémentaires* pour continuer. Un client qui découvre le produit s'arrête là.

Azure Trusted Signing est le moyen le moins cher d'y répondre : pas de jeton matériel, une facturation à l'usage, et une identité d'organisation validée par Microsoft. La validation prend quelques jours et demande des justificatifs de la société : c'est elle qui rend cette tâche différée plutôt que faite.

## Ce que la CI attend déjà

Le job `desktop` de [`.github/workflows/release.yml`](../../.github/workflows/release.yml) porte la branche complète. Elle est inerte tant que `AZURE_SIGNING_ENDPOINT` est vide : le build va au bout, dit `Azure Trusted Signing n'est pas configuré : build non signé.`, et publie un installateur non signé.

```bash
bun --cwd=apps/desktop run build:win \
  "-c.win.azureSignOptions.endpoint=$AZURE_ENDPOINT" \
  "-c.win.azureSignOptions.codeSigningAccountName=$AZURE_ACCOUNT" \
  "-c.win.azureSignOptions.certificateProfileName=$AZURE_PROFILE"
```

Les trois noms sont des **variables** de dépôt, pas des secrets : ils nomment un compte, ils n'ouvrent rien. Les trois identifiants de l'application Entra ID sont des **secrets**, lus par electron-builder dans l'environnement (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`).

## Ce que le propriétaire fait, dans le portail

1. Créer un **compte Trusted Signing** dans une région proche — *West Europe*, par exemple. Le nommer `ppt-signing`.
2. Y créer une **identité** et la faire valider : justificatifs de la société marocaine, quelques jours d'attente. Choisir *Public Trust* — c'est le seul niveau que Windows reconnaît sans avertissement.
3. Une fois l'identité validée, créer un **profil de certificat**, nommé `ppt-app`.
4. Créer une **application Entra ID**, lui donner un secret client, puis lui attribuer le rôle *Trusted Signing Certificate Profile Signer* sur le compte de signature.
5. Poser dans GitHub → *Settings* → *Environments* → `release` :
   - variables : `AZURE_SIGNING_ENDPOINT` (par exemple `https://weu.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT` = `ppt-signing`, `AZURE_SIGNING_PROFILE` = `ppt-app` ;
   - secrets : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

Rien de tout cela n'entre dans le dépôt, sous aucune forme.

## Ce que l'agent fait, quand les valeurs existent

1. Vérifier que `electron-builder` sait signer avec ces quatre noms sans que rien ne soit ajouté à `apps/desktop/electron-builder.yml` : la branche Windows du workflow les passe en ligne de commande, et le fichier reste sans valeur propre au compte.
2. Mettre à jour le tableau des secrets et des variables de [`docs/monorepo.md`](../monorepo.md) — les noms exacts du compte et du profil, dans la même passe que le portail.
3. Retirer la ligne « Le compte Azure Trusted Signing et ses trois variables » du tableau « Ce qui manque encore » de [`.claude/skills/release/SKILL.md`](../../.claude/skills/release/SKILL.md).
4. Supprimer ce fichier : une tâche faite n'est pas une tâche à lire.

## Comment on saura que c'est fait

- Le job `desktop` de la prochaine release ne dit plus « build non signé » sur le runner Windows.
- `signtool verify /pa /v "Pupitre-Setup-<version>-x64.exe"` sur une machine Windows répond `Successfully verified`.
- Sur un Windows 11 vierge, l'installateur se lance sans écran SmartScreen.
