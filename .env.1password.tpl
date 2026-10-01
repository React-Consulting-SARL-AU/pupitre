# 1Password reference template, resolved by `op inject` during `bun run dev:prepare`.
# No values here, only references: this file is committed.
#
# The vault and the note come from `environments.json` — the `local` entry, the
# workstation's note; {{OP_VAULT}} and {{OP_ITEM}} are replaced on read
# (per-workstation override with OP_VAULT / OP_ITEM).
#
# Model: a shared vault holds the secrets of all projects, and each Pupitre
# environment is a secure note in that vault, with one field per key below.
#
# ONLY PUT HERE WHAT CANNOT BE DERIVED.
#   - The database has no address: it is the D1 bound to the Worker, local under
#     apps/web/.wrangler/state.
#   - `BETTER_AUTH_SECRET` and `INTERNAL_WORKFLOW_SECRET` are drawn at random
#     per workstation.
#   - `STRIPE_WEBHOOK_SECRET` comes from the Stripe CLI.
#   - `BETTER_AUTH_URL`, `VITE_APP_URL`, `EMAIL_FROM` and `PUPITRE_DOWNLOADS_URL`
#     come from the `vars` of `apps/web/wrangler.jsonc`.
#
# WARNING: `op inject` fails as a whole if a single field is missing from the note.
# Keep a key commented out as long as its field does not exist.

# --- Billing, dormant in BILLING_MODE=off. The key and the two prices
# are enough for a test payment in BILLING_MODE=stripe.
STRIPE_SECRET_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_SECRET_KEY"
STRIPE_PRICE_SERVER_MONTH="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_PRICE_SERVER_MONTH"
STRIPE_PRICE_SERVER_YEAR="op://{{OP_VAULT}}/{{OP_ITEM}}/STRIPE_PRICE_SERVER_YEAR"
#
# STRIPE_WEBHOOK_SECRET does not belong here: `dev:prepare` derives it with
# `stripe listen --print-secret`, and it differs from the dashboard's.
# Only production needs it, as a Wrangler secret.

# --- Sign-in with GitHub and Google. Each provider requires both of its
# variables; with none, the passkey and the magic link remain the ways in.
# All four are declared in the root `secrets.required` list of
# apps/web/wrangler.jsonc, otherwise Cloudflare would not load them into the
# local Worker — and not in the production list, so that a deployment stays
# possible without them.
GITHUB_CLIENT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/GITHUB_CLIENT_ID"
GITHUB_CLIENT_SECRET="op://{{OP_VAULT}}/{{OP_ITEM}}/GITHUB_CLIENT_SECRET"
GOOGLE_CLIENT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="op://{{OP_VAULT}}/{{OP_ITEM}}/GOOGLE_CLIENT_SECRET"

# --- Agent binaries on the private `ppt-agent` bucket. When absent, the
# platform returns a local URL and the app says there is nothing to download.
R2_ACCOUNT_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_ACCOUNT_ID"
R2_ACCESS_KEY_ID="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_ACCESS_KEY_ID"
R2_SECRET_ACCESS_KEY="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_SECRET_ACCESS_KEY"
R2_BUCKET_NAME="op://{{OP_VAULT}}/{{OP_ITEM}}/R2_BUCKET_NAME"

# --- The release pipeline token. The same value here, on each environment's
# Worker, and in the GitHub secrets: their agreement is what opens the release
# routes. Prefixed `pupitre_pub_`, otherwise the platform mistakes it for a
# session and refuses it. `bun run secrets:draw` draws it and drops it into
# each note.
PUPITRE_PUBLISH_TOKEN="op://{{OP_VAULT}}/{{OP_ITEM}}/PUPITRE_PUBLISH_TOKEN"

# --- The tunnel that makes the local console reachable from a VPS. The token of
# a tunnel managed from the Cloudflare dashboard (Zero Trust → Networks →
# Tunnels → ppt-dev): one token per tunnel, no `cloudflared tunnel login`
# that would bind the whole workstation to a single account. When absent,
# `dev:tunnel` says so and stops on its own.
PUPITRE_TUNNEL_TOKEN="op://{{OP_VAULT}}/{{OP_ITEM}}/PUPITRE_TUNNEL_TOKEN"

# --- Site. Public values, set by `build:production` in apps/site/package.json
# (release list, Cloudflare Web Analytics token); nothing to inject here.
# PUBLIC_RELEASES_URL="op://{{OP_VAULT}}/{{OP_ITEM}}/PUBLIC_RELEASES_URL"
