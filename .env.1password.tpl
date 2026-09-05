# Modèle de références 1Password, résolu par `op inject` pendant `bun run dev:prepare`.
# Aucune valeur ici, seulement des références : ce fichier est committé.
#
# Le coffre et l'élément viennent de `op.config.json` ; {{OP_VAULT}} et {{OP_ITEM}}
# sont remplacés à la lecture (surcharge par poste avec OP_VAULT / OP_ITEM).
#
# Modèle : un coffre partagé porte les secrets de tous les projets, et Pupitre est
# une seule note sécurisée dans ce coffre, avec un champ par clé ci-dessous.
#
# NE METTRE ICI QUE CE QUI NE SE DÉRIVE PAS.
#   - `DATABASE_URL` et `MIGRATE_DATABASE_URL` viennent de `neonctl`.
#   - `BETTER_AUTH_SECRET` et `INTERNAL_WORKFLOW_SECRET` sont tirés au hasard par poste.
#   - `STRIPE_WEBHOOK_SECRET` vient du CLI Stripe.
#   - `BETTER_AUTH_URL`, `VITE_APP_URL` et `EMAIL_FROM` viennent des `vars` de `apps/web/wrangler.jsonc`.
#
# ATTENTION : `op inject` échoue en bloc si un seul champ manque dans la note.
# Garde une clé en commentaire tant que son champ n'existe pas.

# --- Facturation. La clé et les deux prix suffisent pour un paiement de test.
STRIPE_SECRET_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_SECRET_KEY"
STRIPE_PRICE_SERVER_MONTH="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_PRICE_SERVER_MONTH"
STRIPE_PRICE_SERVER_YEAR="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_PRICE_SERVER_YEAR"
#
# STRIPE_WEBHOOK_SECRET n'a pas sa place ici : `dev:prepare` le dérive par
# `stripe listen --print-secret`, et il diffère de celui du tableau de bord.
# Seuls staging et production en ont besoin, par secret Wrangler.

# --- Connexion par GitHub et par Google. Chaque fournisseur exige ses deux
# variables ; sans aucune, la clé d'accès et le lien magique restent les chemins.
# GITHUB_CLIENT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/GITHUB_CLIENT_ID"
# GITHUB_CLIENT_SECRET="op://{{OP_VAULT}}/{{OP_ITEM}}/GITHUB_CLIENT_SECRET"
# GOOGLE_CLIENT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/GOOGLE_CLIENT_ID"
# GOOGLE_CLIENT_SECRET="op://{{OP_VAULT}}/{{OP_ITEM}}/GOOGLE_CLIENT_SECRET"

# --- Binaires signés de l'agent sur R2. Absentes, la distribution est coupée.
# R2_ACCOUNT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_ACCOUNT_ID"
# R2_ACCESS_KEY_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_ACCESS_KEY_ID"
# R2_SECRET_ACCESS_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_SECRET_ACCESS_KEY"
# R2_BUCKET_NAME="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_BUCKET_NAME"

# --- Site. Absentes, le site se construit sans mesure d'audience.
# PUBLIC_RELEASES_URL="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_RELEASES_URL"
# PUBLIC_POSTHOG_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_POSTHOG_KEY"
# PUBLIC_POSTHOG_HOST="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_POSTHOG_HOST"
