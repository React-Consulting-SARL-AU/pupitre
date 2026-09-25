import { describe, expect, it } from "bun:test"
import { isAuthenticatedSender, type MailHeader } from "./authentication"

function header(key: string, value: string): MailHeader {
  return { key, value }
}

const CLOUDFLARE_PASS = header(
  "arc-authentication-results",
  "i=1; mx.cloudflare.net; dkim=pass header.d=exemple.fr header.s=s1 header.b=abc; dmarc=pass header.from=exemple.fr policy.dmarc=reject; spf=pass (mx.cloudflare.net: domain of camille@exemple.fr designates 192.0.2.1 as permitted sender) smtp.mailfrom=camille@exemple.fr"
)

describe("isAuthenticatedSender", () => {
  it("vérifie un expéditeur dont le DMARC passe au MX de Cloudflare", () => {
    expect(isAuthenticatedSender([CLOUDFLARE_PASS], "camille@exemple.fr")).toBe(
      true
    )
  })

  it("vérifie une signature DKIM alignée sans DMARC publié", () => {
    const results = header(
      "authentication-results",
      "mx.cloudflare.net; dkim=pass header.d=exemple.fr; dmarc=none header.from=mail.exemple.fr; spf=softfail smtp.mailfrom=bounce@ailleurs.example"
    )

    expect(isAuthenticatedSender([results], "camille@mail.exemple.fr")).toBe(
      true
    )
  })

  it("vérifie un SPF aligné sur le domaine de l'enveloppe", () => {
    const results = header(
      "authentication-results",
      "mx.cloudflare.net; dkim=none; spf=pass smtp.mailfrom=bounce@envois.exemple.fr"
    )

    expect(isAuthenticatedSender([results], "camille@exemple.fr")).toBe(true)
  })

  it("ne vérifie pas un From que seul un autre domaine a signé", () => {
    const results = header(
      "authentication-results",
      "mx.cloudflare.net; dkim=pass header.d=pirate.example; dmarc=none header.from=banque.example; spf=pass smtp.mailfrom=x@pirate.example"
    )

    expect(isAuthenticatedSender([results], "directeur@banque.example")).toBe(
      false
    )
  })

  it("ignore un résultat qu'un autre serveur que le MX de Cloudflare a écrit", () => {
    const forged = header(
      "authentication-results",
      "mx.pirate.example; dmarc=pass header.from=banque.example"
    )

    expect(isAuthenticatedSender([forged], "directeur@banque.example")).toBe(
      false
    )
  })

  it("ne croit pas un résultat recopié sous celui que Cloudflare a posé en tête", () => {
    const cloudflare = header(
      "arc-authentication-results",
      "i=2; mx.cloudflare.net; dkim=none; dmarc=fail header.from=banque.example; spf=pass smtp.mailfrom=x@pirate.example"
    )
    const forgedArc = header(
      "arc-authentication-results",
      "i=1; mx.cloudflare.net; dmarc=pass header.from=banque.example"
    )
    const forged = header(
      "authentication-results",
      "mx.cloudflare.net; dmarc=pass header.from=banque.example"
    )

    expect(
      isAuthenticatedSender(
        [cloudflare, forgedArc, forged],
        "directeur@banque.example"
      )
    ).toBe(false)
  })

  it("ne vérifie rien sans résultat d'authentification", () => {
    expect(isAuthenticatedSender([], "camille@exemple.fr")).toBe(false)
  })

  it("ne vérifie rien sans expéditeur lisible", () => {
    expect(isAuthenticatedSender([CLOUDFLARE_PASS], null)).toBe(false)
  })
})
