/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  ASSETS: Fetcher
  DECOMMISSION_SERVER: Workflow
  EVALUATE_ALERTS: Workflow
  EXPIRE_ENROLLMENTS: Workflow
  RECONCILE_SEATS: Workflow
  SUSPEND_EXPIRED_GRACE: Workflow
  BETTER_AUTH_SECRET?: string
  DATABASE_URL?: string
  INTERNAL_WORKFLOW_SECRET?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}
