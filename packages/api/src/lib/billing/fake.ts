import {
  type BillingProvider,
  BillingProviderError,
  type BillingSession,
  type CheckoutSessionInput,
  type PortalSessionInput,
  type RemoteSubscription,
} from "./provider"

export interface QuantityChange {
  subscriptionId: string
  quantity: number
}

export interface FakeBilling extends BillingProvider {
  readonly checkouts: CheckoutSessionInput[]
  readonly portals: PortalSessionInput[]
  readonly quantities: QuantityChange[]
  readonly cancellations: string[]
  put(subscription: RemoteSubscription): void
  reset(): void
}

export function createFakeBilling(): FakeBilling {
  const checkouts: CheckoutSessionInput[] = []
  const portals: PortalSessionInput[] = []
  const quantities: QuantityChange[] = []
  const cancellations: string[] = []
  const subscriptions = new Map<string, RemoteSubscription>()
  let counter = 0

  function subscriptionOf(subscriptionId: string): RemoteSubscription {
    const subscription = subscriptions.get(subscriptionId)

    if (!subscription) {
      throw new BillingProviderError(
        404,
        `No such subscription: ${subscriptionId}`
      )
    }

    return subscription
  }

  return {
    checkouts,
    portals,
    quantities,
    cancellations,

    put(subscription: RemoteSubscription): void {
      subscriptions.set(subscription.id, subscription)
    },

    reset(): void {
      checkouts.length = 0
      portals.length = 0
      quantities.length = 0
      cancellations.length = 0
      subscriptions.clear()
      counter = 0
    },

    createCheckoutSession(
      input: CheckoutSessionInput
    ): Promise<BillingSession> {
      counter += 1
      checkouts.push(input)

      const id = `cs_test_${counter}`

      return Promise.resolve({
        id,
        url: `https://checkout.stripe.test/c/${id}`,
      })
    },

    createPortalSession(input: PortalSessionInput): Promise<BillingSession> {
      counter += 1
      portals.push(input)

      const id = `bps_test_${counter}`

      return Promise.resolve({
        id,
        url: `https://billing.stripe.test/p/${id}`,
      })
    },

    retrieveSubscription(subscriptionId: string): Promise<RemoteSubscription> {
      return Promise.resolve(subscriptionOf(subscriptionId))
    },

    updateQuantity(
      subscriptionId: string,
      quantity: number
    ): Promise<RemoteSubscription> {
      const updated = { ...subscriptionOf(subscriptionId), quantity }

      subscriptions.set(subscriptionId, updated)
      quantities.push({ subscriptionId, quantity })

      return Promise.resolve(updated)
    },

    cancelSubscription(subscriptionId: string): Promise<RemoteSubscription> {
      const canceled = {
        ...subscriptionOf(subscriptionId),
        status: "canceled",
      }

      subscriptions.set(subscriptionId, canceled)
      cancellations.push(subscriptionId)

      return Promise.resolve(canceled)
    },
  }
}
