# 0013 — Encrypted backups in the customer's S3 bucket

Date: 2026-09-24 · Status: accepted

The agent backs up the configuration, secrets, databases, projects and sessions of the `dev` account to an S3 bucket the customer owns — Cloudflare R2, AWS S3 or any compatible service. Each part is encrypted on the server for an X25519 public key derived from a passphrase only the customer knows: the app derives it at the moment they type it, then forgets it, keeping only the public key and the salt. For each backup the platform keeps only the address, the manifest fingerprint and counts, never a name or any content. A backup is restored onto a new server during onboarding, or onto an existing server being put back into that state.

Why: the customer's server remains the source of truth and the customer keeps everything, including their backups, without Pupitre storing a byte of their content or being able to read it. The cost of storage is on the customer, the platform's is one row per backup. A passphrase kept nowhere cannot leak from anywhere; its price is that a lost passphrase makes the backups unreadable, and the app says so.

The bucket and its keys are the customer's, which they enter themselves in the app: Pupitre holds no backup bucket, neither for its customers nor for its own trials, and no bucket key passes through the platform or through the project's secrets. Storing backups at Pupitre would cost too much for a server the customer brings; that will be the Hosted offer's business, which will supply the server and can supply the bucket with it.

Ruled out: encrypting with a key the app would keep in the keychain (a backup must open from a new computer); a block-deduplicated repository à la restic (far more complex, and the bucket-side copy of an unchanged part already makes uploading an untouched project free); a machine reset by the agent (reinstalling the image at the host is safer).

Contract: [backups.md](../contracts/backups.md).
