# 0007 — Stripe Managed Payments as Merchant of Record

Date: 2026-09-04 · Status: amended on 2026-10-01 by [0018](./0018-source-available-and-free.md) — dormant: production runs with `BILLING_MODE=off`, nothing is sold, and the day Stripe is used it sells a licence beyond the free servers, without the monthly and annual prices described here

Stripe collects payments as Merchant of Record through Managed Payments: Stripe is the legal seller and handles taxes, disputes and transactional support. Only Checkout and Payment Links are used; no Elements or custom flow. Every session carries `managed_payments[enabled]=true` — without that parameter, the sale is made in our name and no tax is collected.

Why: an LLC selling in 40 countries does not register for VAT everywhere; everything stays on one Stripe account with Stripe Billing for quantities and the portal.

A single product, `Pupitre Server`, tax code `txcd_10103001`, billed by quantity: one seat equals one server. Two prices in dollars, monthly and annual, `tax_behavior` `exclusive`. The LLC sells from the United States and settles in dollars; Adaptive Pricing, still active under Managed Payments, presents and charges in the customer's currency. A price in euros would do the opposite of what we want: a currency already declared on the price disables automatic conversion for that country.

What Stripe does and we do not write: tax calculation and remittance, local payment methods, Radar, disputes, receipts and invoices sent by Link, subscription management by the customer on link.com, refunds. We send no parameter that Managed Payments forbids (`automatic_tax`, `tax_id_collection`, `payment_method_types`, `invoice_creation`, `adaptive_pricing`).

Polar is the fallback if activation is refused to the LLC.
