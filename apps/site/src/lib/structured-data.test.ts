import { getPlan, PLANS, yearlyPriceEur } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import {
  faqPage,
  jsonLd,
  product,
  softwareApplication,
} from "./structured-data"

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
    expect(data.url).toBe("https://pupitre.sh/")
    expect(data.inLanguage).toBe("en")
    expect(data.applicationCategory).toBe("DeveloperApplication")
    expect(data.operatingSystem).toBe("macOS, Windows, Linux")
    expect(data.offers).toEqual({
      "@type": "Offer",
      price: String(getPlan("solo").monthlyPriceEur),
      priceCurrency: "EUR",
      url: "https://pupitre.sh/pricing/",
    })
  })

  it("localises the urls under /fr", () => {
    const data = softwareApplication({
      locale: "fr",
      name: "Pupitre",
      description: "Une machine.",
    })

    expect(data.url).toBe("https://pupitre.sh/fr/")
    expect(data.inLanguage).toBe("fr")
    expect(data.offers.url).toBe("https://pupitre.sh/fr/pricing/")
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
    expect(data.url).toBe("https://pupitre.sh/pricing/")
    expect(data.brand).toEqual({ "@type": "Brand", name: "Pupitre" })
    expect(data.offers).toHaveLength(available.length * 2)
    expect(data.offers[0]).toEqual({
      "@type": "Offer",
      name: "Solo, monthly",
      price: String(getPlan("solo").monthlyPriceEur),
      priceCurrency: "EUR",
      url: "https://app.pupitre.sh/",
      availability: "https://schema.org/InStock",
    })
    expect(data.offers[1]).toEqual({
      "@type": "Offer",
      name: "Solo, yearly",
      price: String(yearlyPriceEur(getPlan("solo"))),
      priceCurrency: "EUR",
      url: "https://app.pupitre.sh/",
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

    expect(data.url).toBe("https://pupitre.sh/fr/pricing/")
    expect(data.offers.map((offer) => offer.name)).toEqual([
      "Solo, mensuel",
      "Solo, annuel",
      "Équipe, mensuel",
      "Équipe, annuel",
    ])
  })
})
