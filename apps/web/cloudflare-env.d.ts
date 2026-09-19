/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  ASSETS: Fetcher
  DB: D1Database
  MAIL: R2Bucket
  INBOX_REALTIME: DurableObjectNamespace
  DECOMMISSION_SERVER: Workflow
  EVALUATE_ALERTS: Workflow
  EXPIRE_ENROLLMENTS: Workflow
  RECONCILE_SEATS: Workflow
  SUSPEND_EXPIRED_GRACE: Workflow
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  EMAIL_FROM?: string
  INTERNAL_WORKFLOW_SECRET?: string
  PUPITRE_ENVIRONMENT?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  VITE_APP_URL?: string
}
