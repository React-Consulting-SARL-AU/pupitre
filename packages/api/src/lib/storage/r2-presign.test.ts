import { describe, expect, it } from "bun:test"
import { presignR2 } from "./r2-presign"

const CONFIG = {
  accountId: "acc123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret-example",
  bucketName: "ppt-mail",
}

const NOW = new Date("2026-09-18T10:20:30.123Z")

const SIGNATURE_RE = /^[0-9a-f]{64}$/

async function sign(
  overrides: Partial<Parameters<typeof presignR2>[0]> = {}
): Promise<URL> {
  return new URL(
    await presignR2({
      config: CONFIG,
      method: "GET",
      key: "mail/inbound/abc/attachments/0/rapport été.pdf",
      ttlSeconds: 600,
      now: NOW,
      ...overrides,
    })
  )
}

describe("presignR2", () => {
  it("targets the bucket on the account's S3 host, with the key encoded", async () => {
    const url = await sign()

    expect(url.protocol).toBe("https:")
    expect(url.hostname).toBe("acc123.r2.cloudflarestorage.com")
    expect(url.pathname).toBe(
      "/ppt-mail/mail/inbound/abc/attachments/0/rapport%20%C3%A9t%C3%A9.pdf"
    )
  })

  it("carries the SigV4 parameters of an unsigned payload on the host alone", async () => {
    const url = await sign()

    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAEXAMPLE/20260918/auto/s3/aws4_request"
    )
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260918T102030Z")
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host")
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(SIGNATURE_RE)
    expect(url.search).not.toContain("UNSIGNED-PAYLOAD")
  })

  it("sorts the query and puts the signature last", async () => {
    const url = await sign({
      query: {
        "response-content-type": "application/pdf",
        "response-content-disposition": 'inline; filename="rapport.pdf"',
      },
    })
    const names = url.search
      .slice(1)
      .split("&")
      .map((pair) => pair.split("=")[0])

    expect(names).toEqual(
      [...names.slice(0, -1)].sort().concat("X-Amz-Signature")
    )
    expect(names.at(-1)).toBe("X-Amz-Signature")
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'inline; filename="rapport.pdf"'
    )
    expect(url.searchParams.get("response-content-type")).toBe(
      "application/pdf"
    )
  })

  it("signs the response parameters: changing them changes the signature", async () => {
    const inline = await sign({
      query: { "response-content-disposition": "inline" },
    })
    const attachment = await sign({
      query: { "response-content-disposition": "attachment" },
    })
    const bare = await sign()

    expect(inline.searchParams.get("X-Amz-Signature")).not.toBe(
      attachment.searchParams.get("X-Amz-Signature")
    )
    expect(inline.searchParams.get("X-Amz-Signature")).not.toBe(
      bare.searchParams.get("X-Amz-Signature")
    )
  })

  it("signs the key and the method: another object or a PUT do not share the signature", async () => {
    const get = await sign()
    const other = await sign({ key: "mail/inbound/abc/raw.eml" })
    const put = await sign({ method: "PUT" })

    expect(get.searchParams.get("X-Amz-Signature")).not.toBe(
      other.searchParams.get("X-Amz-Signature")
    )
    expect(get.searchParams.get("X-Amz-Signature")).not.toBe(
      put.searchParams.get("X-Amz-Signature")
    )
    expect(put.pathname).toBe(get.pathname)
  })

  it("is deterministic for the same input", async () => {
    expect((await sign()).href).toBe((await sign()).href)
  })
})
