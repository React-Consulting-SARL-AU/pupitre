# Signing the Windows installer with Azure Trusted Signing

Status: **to do**, once the owner has opened the Azure account.
Opened on 2026-09-07. Worked around since 2026-09-25: the `desktop` job of `release.yml` sets `PUPITRE_ALLOW_UNSIGNED_WINDOWS: "1"`, and a `stable` release publishes an unsigned Windows installer, saying so in its log. macOS and Linux stay enforced; the release Ed25519 signature still protects Windows updates.

## Why

The release pipeline already signs macOS (Developer ID then notarization) and signs every artifact with the release Ed25519 key. Windows has no free equivalent: without a recognized certificate, SmartScreen shows a blue "Windows protected your PC" screen the first time the installer runs, and you must click *More info* to continue. A customer discovering the product stops there.

Azure Trusted Signing is the cheapest way to answer this: no hardware token, pay-per-use billing, and an organization identity validated by Microsoft. Validation takes a few days and requires the company's supporting documents: that is what makes this task deferred rather than done.

## What the CI already expects

The `desktop` job of [`.github/workflows/release.yml`](../../.github/workflows/release.yml) carries the complete branch. Without `PUPITRE_ALLOW_UNSIGNED_WINDOWS`, as long as one of the seven values is missing, a `stable` release **stops** on the Windows runner, naming them; a `beta` build goes through to the end, says `Azure Trusted Signing is not configured: the Windows build is unsigned.`, and publishes an unsigned installer.

```bash
bun --cwd=apps/desktop run build:win \
  "-c.win.azureSignOptions.endpoint=$AZURE_SIGNING_ENDPOINT" \
  "-c.win.azureSignOptions.codeSigningAccountName=$AZURE_SIGNING_ACCOUNT" \
  "-c.win.azureSignOptions.certificateProfileName=$AZURE_SIGNING_PROFILE" \
  "-c.win.azureSignOptions.publisherName=$AZURE_SIGNING_PUBLISHER" \
  "-c.win.forceCodeSigning=true"
```

The four names are repository **variables**, not secrets: they name an account, they open nothing. The publisher is the subject name of the certificate that Trusted Signing issues — the name of the validated identity, as `signtool verify /pa /v` shows it under `Issued to`; Trusted Signing does not hand it to electron-builder, which writes it into `app-update.yml` only if it receives it, and it is what an installed app compares with an update's Authenticode signature. The three identifiers of the Entra ID application are **secrets**, read by electron-builder from the environment (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`).

## What the owner does, in the portal

1. Create a **Trusted Signing account** in a nearby region — *West Europe*, for example. Name it `ppt-signing`.
2. Create an **identity** in it and have it validated: supporting documents for the Moroccan company, a few days' wait. Choose *Public Trust* — it is the only level Windows recognizes without a warning.
3. Once the identity is validated, create a **certificate profile**, named `ppt-app`.
4. Create an **Entra ID application**, give it a client secret, then assign it the *Trusted Signing Certificate Profile Signer* role on the signing account.
5. Set in GitHub → *Settings* → *Environments* → `release`:
   - variables: `AZURE_SIGNING_ENDPOINT` (for example `https://weu.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT` = `ppt-signing`, `AZURE_SIGNING_PROFILE` = `ppt-app`, `AZURE_SIGNING_PUBLISHER` = the name of the validated identity, exactly as the certificate carries it;
   - secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

None of this enters the repository, in any form.

## What the agent does, once the values exist

1. Remove `PUPITRE_ALLOW_UNSIGNED_WINDOWS` from the `desktop` job of `release.yml`, then `windowsSigningRequired` from `scripts/release/desktop.ts` and its test.
2. Check that `electron-builder` can sign with these names without anything being added to `apps/desktop/electron-builder.yml`: the workflow's Windows branch passes them on the command line, and the file stays free of any account-specific value.
3. Update the secrets and variables table in [`docs/monorepo.md`](../monorepo.md) — the exact names of the account and the profile, in the same pass as the portal.
4. Remove the "Windows signing" row from the "What is still missing" table in [`.claude/skills/release/SKILL.md`](../../.claude/skills/release/SKILL.md).
5. Delete this file: a finished task is not a task to read.

## How we will know it is done

- The `desktop` job of the next `stable` release goes through to the end on the Windows runner, and the installer's `app-update.yml` carries `publisherName`.
- `signtool verify /pa /v "Pupitre-Setup-<version>-x64.exe"` on a Windows machine answers `Successfully verified`.
- On a clean Windows 11, the installer launches with no SmartScreen screen.
