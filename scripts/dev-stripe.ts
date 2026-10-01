import { spawn, spawnSync } from "node:child_process"

const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]

const FORWARD_TO = "http://localhost:3000/api/v1/webhooks/stripe"

function say(message: string): void {
  process.stdout.write(`stripe: ${message}\n`)
}

// Exits cleanly so a missing Stripe CLI never takes the dev servers down with it.
function give(message: string, fix?: string): never {
  say(message)

  if (fix) {
    say(fix)
  }

  process.exit(0)
}

function installed(): boolean {
  return spawnSync("which", ["stripe"], { stdio: "ignore" }).status === 0
}

function main(): void {
  if (process.env.BILLING_MODE !== "stripe") {
    give("skipped: BILLING_MODE is not `stripe`, so nothing calls Stripe.")
  }

  if (!installed()) {
    give(
      "skipped: the `stripe` CLI is not installed.",
      "Install it (brew install stripe/stripe-cli/stripe) to receive webhooks locally."
    )
  }

  const child = spawn(
    "stripe",
    ["listen", "--events", EVENTS.join(","), "--forward-to", FORWARD_TO],
    { stdio: "inherit" }
  )

  child.on("exit", (code) => process.exit(code ?? 0))
}

main()
