import { getPlan } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { faqPage, jsonLd, softwareApplication } from "./structured-data"

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
