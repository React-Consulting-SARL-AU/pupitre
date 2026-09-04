import { describe, expect, it } from "bun:test"
import {
  DESKTOP_CLIENT_ID,
  DeviceFlowError,
  fetchWithBearer,
  pollDeviceFlow,
  startDeviceFlow,
} from "./desktop"

interface Captured {
  url: string
  init: RequestInit | undefined
}

function fakeFetch(status: number, payload: unknown, captured: Captured[]) {
  return (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(input), init })

    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      })
    )
  }
}

describe("startDeviceFlow", () => {
  it("posts the client id to /api/auth/device/code and returns the codes", async () => {
    const captured: Captured[] = []
    const started = await startDeviceFlow("https://app.pupitre.sh/", {
      fetch: fakeFetch(
        200,
        {
          device_code: "dc",
          user_code: "ABCD-1234",
          verification_uri: "https://app.pupitre.sh/auth/device",
          verification_uri_complete:
            "https://app.pupitre.sh/auth/device?user_code=ABCD-1234",
          expires_in: 1800,
          interval: 5,
        },
        captured
      ),
    })

    expect(captured[0].url).toBe("https://app.pupitre.sh/api/auth/device/code")
    expect(captured[0].init?.method).toBe("POST")
    expect(JSON.parse(String(captured[0].init?.body))).toEqual({
      client_id: DESKTOP_CLIENT_ID,
    })
    expect(started.user_code).toBe("ABCD-1234")
    expect(started.interval).toBe(5)
  })

  it("throws a DeviceFlowError on a refused client", async () => {
    const promise = startDeviceFlow("https://app.pupitre.sh", {
      fetch: fakeFetch(
        400,
        { error: "invalid_client", error_description: "nope" },
        []
      ),
    })

    await expect(promise).rejects.toBeInstanceOf(DeviceFlowError)
    await expect(promise).rejects.toMatchObject({ code: "invalid_client" })
  })
})

describe("pollDeviceFlow", () => {
  it("sends the device code grant and maps every outcome", async () => {
    const captured: Captured[] = []

    const authorized = await pollDeviceFlow("https://app.pupitre.sh", "dc", {
      fetch: fakeFetch(
        200,
        { access_token: "tok", token_type: "Bearer", expires_in: 10 },
        captured
      ),
    })

    expect(captured[0].url).toBe("https://app.pupitre.sh/api/auth/device/token")
    expect(JSON.parse(String(captured[0].init?.body))).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: "dc",
      client_id: DESKTOP_CLIENT_ID,
    })
    expect(authorized).toEqual({
      status: "authorized",
      token: "tok",
      expires_in: 10,
    })

    for (const [error, status] of [
      ["authorization_pending", "authorization_pending"],
      ["slow_down", "slow_down"],
      ["expired_token", "expired"],
      ["access_denied", "denied"],
    ] as const) {
      expect(
        await pollDeviceFlow("https://app.pupitre.sh", "dc", {
          fetch: fakeFetch(400, { error, error_description: error }, []),
        })
      ).toEqual({ status })
    }

    await expect(
      pollDeviceFlow("https://app.pupitre.sh", "dc", {
        fetch: fakeFetch(400, { error: "invalid_grant" }, []),
      })
    ).rejects.toMatchObject({ code: "invalid_grant" })
  })
})

describe("fetchWithBearer", () => {
  it("adds the Authorization header and keeps the caller's headers", async () => {
    const captured: Captured[] = []
    const request = fetchWithBearer("tok", fakeFetch(200, {}, captured))

    await request("https://app.pupitre.sh/api/v1/me", {
      headers: { accept: "application/json" },
    })

    const headers = new Headers(captured[0].init?.headers)

    expect(headers.get("authorization")).toBe("Bearer tok")
    expect(headers.get("accept")).toBe("application/json")
  })
})
