import {
  LEGAL_ENTITY,
  type LegalEntity,
  PUPITRE_ORIGINS,
} from "@pupitre/shared/legal"
import { getPlan, PLANS, yearlyPriceUsd } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import {
  faqPage,
  jsonLd,
  organization,
  product,
  softwareApplication,
} from "./structured-data"

const LAUNCH_END = new Date("2026-12-31T23:59:59Z")

const INCORPORATED: LegalEntity = {
  ...LEGAL_ENTITY,
  status: "incorporated",
  legalName: "Pupitre Labs LLC",
  form: "LLC",
}

describe("organization", () => {
  it("claims no company while the publisher is a person", () => {
    const data = organization({ name: "Pupitre", locale: "en" })

    expect(LEGAL_ENTITY.status).toBe("individual")
    expect(data).not.toHaveProperty("legalName")
    expect(jsonLd(data)).not.toContain("LLC")
    expect(jsonLd(data)).not.toContain(LEGAL_ENTITY.owner)
  })

  it("names the company once one exists", () => {
    const data = organization({
      name: "Pupitre",
      locale: "en",
      entity: INCORPORATED,
    })

    expect(data.legalName).toBe("Pupitre Labs LLC")
  })

  it("claims no legal name for a company whose name is not recorded", () => {
    const data = organization({
      name: "Pupitre",
      locale: "en",
      entity: { ...INCORPORATED, legalName: null },
    })

    expect(data).not.toHaveProperty("legalName")
  })

  it("points at the site from the shared origins, and at no other profile", () => {
    const data = organization({ name: "Pupitre", locale: "fr" })

    expect(data["@type"]).toBe("Organization")
    expect(data.name).toBe("Pupitre")
    expect(data.url).toBe(`${PUPITRE_ORIGINS.site}/fr/`)
    expect(data.logo).toBe(`${PUPITRE_ORIGINS.site}/favicon.svg`)
    expect(data).not.toHaveProperty("sameAs")
    expect(jsonLd(data)).not.toContain(PUPITRE_ORIGINS.app)
  })
})

describe("jsonLd", () => {
  it("serialises without a closing tag that could end the script", () => {
    const text = jsonLd({ "@type": "Thing", name: "</script><b>x</b>" })

    expect(text).not.toContain("</script")
    expect(JSON.parse(text)).toEqual({
      "@type": "Thing",
      name: "</script><b>x</b>",
    })
  })
})

describe("softwareApplication", () => {
  it("describes Pupitre as a desktop developer application with the Solo price", () => {
    const data = softwareApplication({
      locale: "en",
      name: "Pupitre",
      description: "A machine for your agents.",
    })

    expect(data["@context"]).toBe("https://schema.org")
    expect(data["@type"]).toBe("SoftwareApplication")
    expect(data.name).toBe("Pupitre")
    expect(data.description).toBe("A machine for your agents.")
    expect(data.url).toBe("https://pupitre.studio/")
    expect(data.inLanguage).toBe("en")
    expect(data.applicationCategory).toBe("DeveloperApplication")
    expect(data.operatingSystem).toBe("macOS, Windows, Linux")
    expect(data.offers).toEqual({
      "@type": "Offer",
      price: String(getPlan("solo").monthlyPriceUsd),
      priceCurrency: "USD",
      url: "https://pupitre.studio/pricing/",
    })
  })

  it("localises the urls under /fr", () => {
    const data = softwareApplication({
      locale: "fr",
      name: "Pupitre",
      description: "Une machine.",
    })

    expect(data.url).toBe("https://pupitre.studio/fr/")
    expect(data.inLanguage).toBe("fr")
    expect(data.offers.url).toBe("https://pupitre.studio/fr/pricing/")
  })
})

describe("faqPage", () => {
  it("lists each question with its answer", () => {
    const data = faqPage([
      { question: "Windows?", answer: "The app runs on Windows 11." },
      { question: "Leaving?", answer: "The server stays yours." },
    ])

    expect(data["@context"]).toBe("https://schema.org")
    expect(data["@type"]).toBe("FAQPage")
    expect(data.mainEntity).toEqual([
      {
        "@type": "Question",
        name: "Windows?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The app runs on Windows 11.",
        },
      },
      {
        "@type": "Question",
        name: "Leaving?",
        acceptedAnswer: { "@type": "Answer", text: "The server stays yours." },
      },
    ])
  })
})

describe("product", () => {
  it("lists one Offer per available plan and billing interval, priced from shared", () => {
    const data = product({
      locale: "en",
      name: "Pupitre",
      description: "One price per server.",
      intervals: { month: "monthly", year: "yearly" },
    })
    const available = PLANS.filter((plan) => plan.availability === "available")

    expect(data["@context"]).toBe("https://schema.org")
    expect(data["@type"]).toBe("Product")
    expect(data.name).toBe("Pupitre")
    expect(data.description).toBe("One price per server.")
    expect(data.url).toBe("https://pupitre.studio/pricing/")
    expect(data.brand).toEqual({ "@type": "Brand", name: "Pupitre" })
    expect(data.offers).toHaveLength(available.length * 2)
    expect(data.offers[0]).toEqual({
      "@type": "Offer",
      name: "Solo, monthly",
      price: String(getPlan("solo").monthlyPriceUsd),
      priceCurrency: "USD",
      url: "https://app.pupitre.studio/",
      availability: "https://schema.org/InStock",
    })
    expect(data.offers[1]).toEqual({
      "@type": "Offer",
      name: "Solo, yearly",
      price: String(yearlyPriceUsd(getPlan("solo"))),
      priceCurrency: "USD",
      url: "https://app.pupitre.studio/",
      availability: "https://schema.org/InStock",
    })
    expect(data.offers.map((offer) => offer.name)).not.toContain(
      expect.stringContaining("Hosted")
    )
  })

  it("names the plans in French under /fr", () => {
    const data = product({
      locale: "fr",
      name: "Pupitre",
      description: "Un prix par serveur.",
      intervals: { month: "mensuel", year: "annuel" },
    })

    expect(data.url).toBe("https://pupitre.studio/fr/pricing/")
    expect(data.offers.map((offer) => offer.name)).toEqual([
      "Solo, mensuel",
      "Solo, annuel",
      "Équipe, mensuel",
      "Équipe, annuel",
    ])
  })

  it("offers the launch for free until its last day, and no price nobody can pay yet", () => {
    const data = product({
      locale: "en",
      name: "Pupitre",
      description: "Free during the launch.",
      intervals: { month: "monthly", year: "yearly" },
      launch: { endsAt: LAUNCH_END, name: "Launch, one machine" },
    })

    expect(data.offers).toEqual([
      {
        "@type": "Offer",
        name: "Launch, one machine",
        price: "0",
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        url: "https://app.pupitre.studio/",
        availability: "https://schema.org/InStock",
      },
    ])
  })
})

describe("softwareApplication during the launch", () => {
  it("prices the app at zero until the launch ends", () => {
    const data = softwareApplication({
      locale: "fr",
      name: "Pupitre",
      description: "Une machine.",
      launch: { endsAt: LAUNCH_END, name: "Lancement" },
    })

    expect(data.offers).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      priceValidUntil: "2026-12-31",
      url: "https://pupitre.studio/fr/pricing/",
    })
  })
})
