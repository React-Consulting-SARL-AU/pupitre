# 0014 — Access to the server is granted only by an already authorized device

Date: 2026-09-24 · Status: accepted

The platform can no longer open a server. It relays the devices' public keys, but the agent places one in the managed `authorized_keys` block only if it arrives with an approval signed by a key it already holds as trusted. Removing a key remains possible without a signature: it is the direction that closes access, never the one that opens it.

- **The root of trust is placed by SSH, not by the platform.** At onboarding, the app itself installs the device's key on the server. The agent records it as a signer in a file under `/etc/pupitre`, root, 0600. A key becomes a signer only when placed this way, or accepted through a valid approval.
- **An approval is an SSHSIG signature** (`ssh-keygen -Y sign`, Pupitre's own namespace) made by the private key of an authorized device, which never leaves its computer. It covers the server identifier, the approved public key, the user and the date. The agent verifies the signature, the server and the key; otherwise it ignores the entry and reports it as pending.
- **The gesture for the customer.** A new device, their own or that of a member to whom the server is assigned, appears in the app of every already authorized device: "Authorize <device> of <person> on <server>". One click signs. A customer alone with a single computer sees nothing new.
- **Safeguards.** The agent never removes the last key from the block. Adding a device to the account requires re-presenting the passkey or the second factor and sends an email. Repairing a server is reserved to the assigned person or an admin, and rewrites neither the SSH account nor the host fingerprint.
- **Recovery.** All devices lost: from the host's console, `sudo pupitred keys reset` places a locally supplied key again, and onboarding takes it back.
- **The rest of what the platform pushes is bounded by the agent:**
  - the right of use only restricts;
  - the target version is an Ed25519-signed binary, above a floor;
  - a restore requires the manifest fingerprint;
  - the server identifier is a UUID;
  - key options are refused.

Why: a compromised platform, a stolen admin session or an XSS in the console no longer give root on customers' servers. The worst they can do is cut off an access, which is repaired from the host. The rule "no private key outside the customer's laptop" also becomes "no access without a customer's laptop".

Ruled out:
- **Accepting the platform's power and writing it into the terms**: that was the flaw to close.
- **A customer-specific root key, distinct from the device keys**: one more key to lose, for the same result.
- **Having the app place each key over direct SSH**: impossible when the authorizing device is offline; the relayed signature works deferred.
