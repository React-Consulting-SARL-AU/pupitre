import { describe, expect, it } from "bun:test"
import {
  SIGNATURE_TOLERANCE_MS,
  signStripePayload,
  verifyStripeSignature,
} from "./signature"

const SECRET = "whsec_pupitre"

const PAYLOAD = '{"id":"evt_1","type":"customer.subscription.updated"}'

describe("verifyStripeSignature", () => {
  it("accepte une signature fraîche", async () => {
    const now = new Date()
    const header = await signStripePayload(PAYLOAD, SECRET, now)

    expect(
      await verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        now,
      })
    ).toEqual({ valid: true })
  })

  it("accepte une des signatures d'un en-tête qui en porte plusieurs", async () => {
    const now = new Date()
    const header = await signStripePayload(PAYLOAD, SECRET, now)
    const doubled = `${header},v1=${"0".repeat(64)}`

    expect(
      (
        await verifyStripeSignature({
          payload: PAYLOAD,
          header: doubled,
          secret: SECRET,
          now,
        })
      ).valid
    ).toBe(true)
  })

  it("refuse un corps modifié, un secret différent et un en-tête absent", async () => {
    const now = new Date()
    const header = await signStripePayload(PAYLOAD, SECRET, now)

    expect(
      await verifyStripeSignature({
        payload: `${PAYLOAD} `,
        header,
        secret: SECRET,
        now,
      })
    ).toEqual({ valid: false, refusal: "mismatch" })
    expect(
      await verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: "whsec_autre",
        now,
      })
    ).toEqual({ valid: false, refusal: "mismatch" })
    expect(
      await verifyStripeSignature({
        payload: PAYLOAD,
        header: null,
        secret: SECRET,
      })
    ).toEqual({ valid: false, refusal: "missing" })
    expect(
      await verifyStripeSignature({
        payload: PAYLOAD,
        header: "nothing-signed",
        secret: SECRET,
      })
    ).toEqual({ valid: false, refusal: "malformed" })
  })

  it("borne la tolérance à cinq minutes, dans les deux sens", async () => {
    const now = new Date()
    const inside = await signStripePayload(
      PAYLOAD,
      SECRET,
      new Date(now.getTime() - SIGNATURE_TOLERANCE_MS + 2000)
    )
    const past = await signStripePayload(
      PAYLOAD,
      SECRET,
      new Date(now.getTime() - SIGNATURE_TOLERANCE_MS - 2000)
    )
    const future = await signStripePayload(
      PAYLOAD,
      SECRET,
      new Date(now.getTime() + SIGNATURE_TOLERANCE_MS + 2000)
    )

    expect(
      (
        await verifyStripeSignature({
          payload: PAYLOAD,
          header: inside,
          secret: SECRET,
          now,
        })
      ).valid
    ).toBe(true)
    expect(
      await verifyStripeSignature({
        payload: PAYLOAD,
        header: past,
        secret: SECRET,
        now,
      })
    ).toEqual({ valid: false, refusal: "stale" })
    expect(
      await verifyStripeSignature({
        payload: PAYLOAD,
        header: future,
        secret: SECRET,
        now,
      })
    ).toEqual({ valid: false, refusal: "stale" })
  })
})
