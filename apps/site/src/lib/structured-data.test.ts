import {
  LEGAL_ENTITY,
  type LegalEntity,
  PUPITRE_ORIGINS,
} from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import {
  faqPage,
  jsonLd,
  organization,
  product,
  softwareApplication,
} from "./structured-data"

const INCORPORATED: LegalEntity = {
  ...LEGAL_ENTITY,
  status: "incorporated",
  legalName: "Pupitre Labs LLC",
  form: "LLC",
}

const INDIVIDUAL: LegalEntity = {
  ...LEGAL_ENTITY,
  status: "individual",
  legalName: null,
  form: null,
}

describe("organization", () => {
  it("names the publishing company of the legal record", () => {
    const data = organization({ name: "Pupitre", locale: "en" })

    expect(LEGAL_ENTITY.status).toBe("incorporated")
    expect(data.legalName).toBe(LEGAL_ENTITY.legalName)
    expect(jsonLd(data)).not.toContain(LEGAL_ENTITY.owner)
  })

  it("claims no company while the publisher is a person", () => {
    const data = organization({
      name: "Pupitre",
      locale: "en",
      entity: INDIVIDUAL,
    })

    expect(data).not.toHaveProperty("legalName")
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
  it("describes Pupitre as a free desktop developer application", () => {
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
      price: "0",
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
  it("offers Pupitre for free, as one Offer that opens the console", () => {
    const data = product({
      locale: "en",
      name: "Pupitre",
      description: "Free up to a few servers.",
      offer: "Free, per organisation",
    })

    expect(data["@context"]).toBe("https://schema.org")
    expect(data["@type"]).toBe("Product")
    expect(data.name).toBe("Pupitre")
    expect(data.description).toBe("Free up to a few servers.")
    expect(data.url).toBe("https://pupitre.studio/pricing/")
    expect(data.brand).toEqual({ "@type": "Brand", name: "Pupitre" })
    expect(data.offers).toEqual([
      {
        "@type": "Offer",
        name: "Free, per organisation",
        price: "0",
        priceCurrency: "USD",
        url: "https://app.pupitre.studio/",
        availability: "https://schema.org/InStock",
      },
    ])
  })

  it("localises the url under /fr", () => {
    const data = product({
      locale: "fr",
      name: "Pupitre",
      description: "Gratuit.",
      offer: "Gratuit, par organisation",
    })

    expect(data.url).toBe("https://pupitre.studio/fr/pricing/")
    expect(data.offers[0].name).toBe("Gratuit, par organisation")
  })
})
