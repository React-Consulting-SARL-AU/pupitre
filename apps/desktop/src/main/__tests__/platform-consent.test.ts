import { describe, expect, it } from "bun:test";
import { createPlatformClient } from "../platform-client";

const CONSENT_REFUSAL = {
  error: {
    code: "consent_required",
    fix: "Open https://app.pupitre.studio/auth/consent to read what is stored, where and why, then give your agreement.",
    message:
      "Your agreement to your data being stored by Cloudflare, in the United States, is required before using Pupitre.",
  },
};

function refusing(body: unknown): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 403,
      })
    )) as unknown as typeof fetch;
}

async function refusalFrom(baseUrl: string) {
  const platform = createPlatformClient({
    baseUrl,
    fetch: refusing(CONSENT_REFUSAL),
  });
  const answer = await platform.servers("token");

  if (answer.ok) {
    throw new Error("the platform was expected to refuse");
  }

  return answer.error;
}

describe("a platform refusal for want of a data consent", () => {
  it("keeps its code and names the console's consent page of this platform", async () => {
    const error = await refusalFrom("http://localhost:3000");

    expect(error.code).toBe("consent_required");
    expect(error.phrase).toEqual({
      id: "refusal.account.consent",
      values: { console: "http://localhost:3000/auth/consent" },
    });
  });
});
