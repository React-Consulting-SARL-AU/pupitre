# Signer l'installateur Windows par Azure Trusted Signing

Statut : **à faire**, quand le propriétaire aura ouvert le compte Azure.
Ouverte le 2026-09-07. Contournée depuis le 2026-09-25 : le job `desktop` de `release.yml` pose `PUPITRE_ALLOW_UNSIGNED_WINDOWS: "1"`, et une release `stable` publie un installateur Windows non signé en le disant dans son journal. macOS et Linux restent tenus ; la signature Ed25519 de release protège toujours les mises à jour Windows.

## Pourquoi

Le pipeline de release signe déjà macOS (Developer ID puis notarisation) et signe tous les artefacts avec la clé Ed25519 de release. Windows n'a pas d'équivalent gratuit : sans certificat reconnu, SmartScreen affiche un écran bleu « Windows a protégé votre ordinateur » au premier lancement de l'installateur, et il faut cliquer sur *Informations complémentaires* pour continuer. Un client qui découvre le produit s'arrête là.

Azure Trusted Signing est le moyen le moins cher d'y répondre : pas de jeton matériel, une facturation à l'usage, et une identité d'organisation validée par Microsoft. La validation prend quelques jours et demande des justificatifs de la société : c'est elle qui rend cette tâche différée plutôt que faite.

## Ce que la CI attend déjà

Le job `desktop` de [`.github/workflows/release.yml`](../../.github/workflows/release.yml) porte la branche complète. Sans `PUPITRE_ALLOW_UNSIGNED_WINDOWS`, tant qu'une des sept valeurs manque, une release `stable` **s'arrête** sur le runner Windows en les nommant ; un build `beta` va au bout, dit `Azure Trusted Signing is not configured: the Windows build is unsigned.`, et publie un installateur non signé.

```bash
bun --cwd=apps/desktop run build:win \
  "-c.win.azureSignOptions.endpoint=$AZURE_SIGNING_ENDPOINT" \
  "-c.win.azureSignOptions.codeSigningAccountName=$AZURE_SIGNING_ACCOUNT" \
  "-c.win.azureSignOptions.certificateProfileName=$AZURE_SIGNING_PROFILE" \
  "-c.win.azureSignOptions.publisherName=$AZURE_SIGNING_PUBLISHER" \
  "-c.win.forceCodeSigning=true"
```

Les quatre noms sont des **variables** de dépôt, pas des secrets : ils nomment un compte, ils n'ouvrent rien. L'éditeur est le nom du sujet du certificat que Trusted Signing délivre — le nom de l'identité validée, tel que `signtool verify /pa /v` l'affiche en `Issued to` ; Trusted Signing ne le donne pas à electron-builder, qui l'écrit dans `app-update.yml` seulement s'il le reçoit, et c'est lui qu'une app installée compare à la signature Authenticode d'une mise à jour. Les trois identifiants de l'application Entra ID sont des **secrets**, lus par electron-builder dans l'environnement (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`).

## Ce que le propriétaire fait, dans le portail

1. Créer un **compte Trusted Signing** dans une région proche — *West Europe*, par exemple. Le nommer `ppt-signing`.
2. Y créer une **identité** et la faire valider : justificatifs de la société marocaine, quelques jours d'attente. Choisir *Public Trust* — c'est le seul niveau que Windows reconnaît sans avertissement.
3. Une fois l'identité validée, créer un **profil de certificat**, nommé `ppt-app`.
4. Créer une **application Entra ID**, lui donner un secret client, puis lui attribuer le rôle *Trusted Signing Certificate Profile Signer* sur le compte de signature.
5. Poser dans GitHub → *Settings* → *Environments* → `release` :
   - variables : `AZURE_SIGNING_ENDPOINT` (par exemple `https://weu.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT` = `ppt-signing`, `AZURE_SIGNING_PROFILE` = `ppt-app`, `AZURE_SIGNING_PUBLISHER` = le nom de l'identité validée, exactement comme le certificat le porte ;
   - secrets : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

Rien de tout cela n'entre dans le dépôt, sous aucune forme.

## Ce que l'agent fait, quand les valeurs existent

1. Retirer `PUPITRE_ALLOW_UNSIGNED_WINDOWS` du job `desktop` de `release.yml`, puis `windowsSigningRequired` de `scripts/release/desktop.ts` et son test.
2. Vérifier que `electron-builder` sait signer avec ces noms sans que rien ne soit ajouté à `apps/desktop/electron-builder.yml` : la branche Windows du workflow les passe en ligne de commande, et le fichier reste sans valeur propre au compte.
3. Mettre à jour le tableau des secrets et des variables de [`docs/monorepo.md`](../monorepo.md) — les noms exacts du compte et du profil, dans la même passe que le portail.
4. Retirer la ligne « La signature Windows » du tableau « Ce qui manque encore » de [`.claude/skills/release/SKILL.md`](../../.claude/skills/release/SKILL.md).
5. Supprimer ce fichier : une tâche faite n'est pas une tâche à lire.

## Comment on saura que c'est fait

- Le job `desktop` de la prochaine release `stable` va au bout sur le runner Windows, et le `app-update.yml` de l'installateur porte `publisherName`.
- `signtool verify /pa /v "Pupitre-Setup-<version>-x64.exe"` sur une machine Windows répond `Successfully verified`.
- Sur un Windows 11 vierge, l'installateur se lance sans écran SmartScreen.
