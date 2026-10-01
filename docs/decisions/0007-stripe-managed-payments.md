# 0007 — Stripe Managed Payments en Merchant of Record

Date : 2026-09-04 · Statut : amendée le 2026-10-01 par [0018](./0018-source-disponible-et-gratuit.md) — en sommeil : la production tourne en `BILLING_MODE=off`, rien n'est vendu, et le jour où Stripe sert, il vend une licence au-delà des serveurs gratuits, sans les prix mensuel et annuel décrits ici

Stripe encaisse en Merchant of Record via Managed Payments : Stripe est le vendeur légal, gère taxes, litiges et support transactionnel. Seuls Checkout et Payment Links sont utilisés ; aucun flux Elements ni personnalisé. Chaque session porte `managed_payments[enabled]=true` — sans ce paramètre, la vente se fait en notre nom et aucune taxe n'est collectée.

Pourquoi : une LLC qui vend dans 40 pays ne s'immatricule pas à la TVA partout ; tout reste sur un compte Stripe avec Stripe Billing pour les quantités et le portail.

Un seul produit, `Pupitre Server`, code fiscal `txcd_10103001`, facturé à la quantité : un siège égale un serveur. Deux prix en dollars, mensuel et annuel, `tax_behavior` `exclusive`. La LLC vend depuis les États-Unis et règle en dollars ; Adaptive Pricing, toujours actif sous Managed Payments, présente et prélève dans la devise du client. Un prix en euros ferait l'inverse de ce qu'on veut : une devise déjà déclarée sur le prix désactive la conversion automatique pour ce pays.

Ce que Stripe fait et que nous n'écrivons pas : calcul et reversement des taxes, moyens de paiement locaux, Radar, litiges, reçus et factures envoyés par Link, gestion de l'abonnement par le client sur link.com, remboursements. Nous n'envoyons aucun paramètre que Managed Payments interdit (`automatic_tax`, `tax_id_collection`, `payment_method_types`, `invoice_creation`, `adaptive_pricing`).

Polar est le repli si l'activation est refusée à la LLC.
