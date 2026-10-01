# Modèle de références 1Password, résolu par `op inject` pendant `bun run dev:prepare`.
# Aucune valeur ici, seulement des références : ce fichier est committé.
#
# Le coffre et la note viennent de `environments.json` — celle de `local`, la
# note du poste ; {{OP_VAULT}} et {{OP_ITEM}} sont remplacés à la lecture
# (surcharge par poste avec OP_VAULT / OP_ITEM).
#
# Modèle : un coffre partagé porte les secrets de tous les projets, et chaque
# environnement de Pupitre est une note sécurisée dans ce coffre, avec un champ
# par clé ci-dessous.
#
# NE METTRE ICI QUE CE QUI NE SE DÉRIVE PAS.
#   - La base n'a pas d'adresse : c'est la D1 liée au Worker, locale sous
#     apps/web/.wrangler/state.
#   - `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET` sont tirés au hasard
#     par poste.
#   - `STRIPE_WEBHOOK_SECRET` vient du CLI Stripe.
#   - `BETTER_AUTH_URL`, `VITE_APP_URL`, `EMAIL_FROM` et `PUPITRE_DOWNLOADS_URL`
#     viennent des `vars` de `apps/web/wrangler.jsonc`.
#
# ATTENTION : `op inject` échoue en bloc si un seul champ manque dans la note.
# Garde une clé en commentaire tant que son champ n'existe pas.

# --- Facturation, dormante en BILLING_MODE=off. La clé et les deux prix
# suffisent pour un paiement de test en BILLING_MODE=stripe.
STRIPE_SECRET_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_SECRET_KEY"
STRIPE_PRICE_SERVER_MONTH="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_PRICE_SERVER_MONTH"
STRIPE_PRICE_SERVER_YEAR="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_PRICE_SERVER_YEAR"
#
# STRIPE_WEBHOOK_SECRET n'a pas sa place ici : `dev:prepare` le dérive par
# `stripe listen --print-secret`, et il diffère de celui du tableau de bord.
# Seule la production en a besoin, par secret Wrangler.

# --- Connexion par GitHub et par Google. Chaque fournisseur exige ses deux
# variables ; sans aucune, la clé d'accès et le lien magique restent les chemins.
# Les quatre sont déclarées dans la liste `secrets.required` racine de
# apps/web/wrangler.jsonc, sans quoi Cloudflare ne les chargerait pas dans le
# Worker local — et nulle part dans la liste de production, pour qu'un
# déploiement reste possible sans elles.
GITHUB_CLIENT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/GITHUB_CLIENT_ID"
GITHUB_CLIENT_SECRET="op://{{OP_VAULT}}/{{OP_ITEM}}/GITHUB_CLIENT_SECRET"
GOOGLE_CLIENT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="op://{{OP_VAULT}}/{{OP_ITEM}}/GOOGLE_CLIENT_SECRET"

# --- Binaires de l'agent sur le bucket privé `ppt-agent`. Absentes, la
# plateforme rend une URL locale et l'app dit qu'il n'y a rien à télécharger.
R2_ACCOUNT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_ACCOUNT_ID"
R2_ACCESS_KEY_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_ACCESS_KEY_ID"
R2_SECRET_ACCESS_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_SECRET_ACCESS_KEY"
R2_BUCKET_NAME="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_BUCKET_NAME"

# --- Le jeton du pipeline de release. La même valeur ici, sur le Worker de
# chaque environnement, et dans les secrets GitHub : c'est leur accord qui ouvre
# les routes de version. Préfixé `pupitre_pub_`, sans quoi la plateforme le prend
# pour une session et le refuse. `bun run secrets:draw` le tire et le dépose
# dans chaque note.
PUPITRE_PUBLISH_TOKEN="op://{{OP_VAULT}}/{{OP_ITEM}}/PUPITRE_PUBLISH_TOKEN"

# --- Le tunnel qui rend la console locale joignable d'un VPS. Le jeton d'un
# tunnel géré depuis le tableau de bord Cloudflare (Zero Trust → Networks →
# Tunnels → ppt-dev) : un jeton par tunnel, aucun `cloudflared tunnel login`
# qui lierait tout le poste à un seul compte. Absent, `dev:tunnel` le dit et
# s'arrête seul.
PUPITRE_TUNNEL_TOKEN="op://{{OP_VAULT}}/{{OP_ITEM}}/PUPITRE_TUNNEL_TOKEN"

# --- Site. Absentes, le site se construit sans mesure d'audience.
# PUBLIC_RELEASES_URL="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_RELEASES_URL"
# PUBLIC_POSTHOG_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_POSTHOG_KEY"
# PUBLIC_POSTHOG_HOST="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_POSTHOG_HOST"
