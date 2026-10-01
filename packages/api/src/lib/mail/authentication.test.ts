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
  it("verifies a sender whose DMARC passes at Cloudflare's MX", () => {
    expect(isAuthenticatedSender([CLOUDFLARE_PASS], "camille@exemple.fr")).toBe(
      true
    )
  })

  it("verifies an aligned DKIM signature without a published DMARC", () => {
    const results = header(
      "authentication-results",
      "mx.cloudflare.net; dkim=pass header.d=exemple.fr; dmarc=none header.from=mail.exemple.fr; spf=softfail smtp.mailfrom=bounce@ailleurs.example"
    )

    expect(isAuthenticatedSender([results], "camille@mail.exemple.fr")).toBe(
      true
    )
  })

  it("verifies an SPF aligned with the envelope domain", () => {
    const results = header(
      "authentication-results",
      "mx.cloudflare.net; dkim=none; spf=pass smtp.mailfrom=bounce@envois.exemple.fr"
    )

    expect(isAuthenticatedSender([results], "camille@exemple.fr")).toBe(true)
  })

  it("does not verify a From that only another domain signed", () => {
    const results = header(
      "authentication-results",
      "mx.cloudflare.net; dkim=pass header.d=pirate.example; dmarc=none header.from=banque.example; spf=pass smtp.mailfrom=x@pirate.example"
    )

    expect(isAuthenticatedSender([results], "directeur@banque.example")).toBe(
      false
    )
  })

  it("ignores a result written by a server other than Cloudflare's MX", () => {
    const forged = header(
      "authentication-results",
      "mx.pirate.example; dmarc=pass header.from=banque.example"
    )

    expect(isAuthenticatedSender([forged], "directeur@banque.example")).toBe(
      false
    )
  })

  it("does not trust a result copied below the one Cloudflare put at the top", () => {
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

  it("verifies nothing without an authentication result", () => {
    expect(isAuthenticatedSender([], "camille@exemple.fr")).toBe(false)
  })

  it("verifies nothing without a readable sender", () => {
    expect(isAuthenticatedSender([CLOUDFLARE_PASS], null)).toBe(false)
  })
})
