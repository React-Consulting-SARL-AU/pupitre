import { describe, expect, it } from "bun:test";
import {
  agentBaseUrl,
  buildKindOf,
  createPlatformClient,
  DEV_AGENT_PLATFORM_URL,
  isLocalPlatform,
  LOCAL_PLATFORM_URL,
} from "../platform-client";

describe("the platform targeted in development", () => {
  it("recognises a console served on this machine", () => {
    expect(isLocalPlatform(LOCAL_PLATFORM_URL)).toBe(true);
    expect(isLocalPlatform("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalPlatform("http://[::1]:3000")).toBe(true);
    expect(isLocalPlatform("https://app.pupitre.studio")).toBe(false);
    expect(isLocalPlatform("pas une url")).toBe(false);
  });

  it("behaves as production as soon as the platform is not the local console", () => {
    expect(buildKindOf(false, LOCAL_PLATFORM_URL)).toBe("development");
    expect(buildKindOf(false, "https://app.pupitre.studio")).toBe("production");
    expect(buildKindOf(true, LOCAL_PLATFORM_URL)).toBe("production");
  });

  it("says what to run when the local console does not respond", async () => {
    const client = createPlatformClient({
      baseUrl: LOCAL_PLATFORM_URL,
      fetch: () => Promise.reject(new Error("fetch failed")),
    });

    const answer = await client.me("jeton");

    expect(answer.ok).toBe(false);

    if (!answer.ok) {
      expect(answer.error.code).toBe("offline");
      expect(answer.error.phrase?.id).toBe("refusal.platform.silent.local");
    }
  });

  it("keeps the usual fix for the hosted platform", async () => {
    const client = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: () => Promise.reject(new Error("fetch failed")),
    });

    const answer = await client.me("jeton");

    if (!answer.ok) {
      expect(answer.error.phrase?.id).toBe("refusal.platform.silent");
    }
  });
});

describe("the platform given to the agent", () => {
  it("replaces a local console with the tunnel that publishes it", () => {
    expect(agentBaseUrl(LOCAL_PLATFORM_URL)).toBe(DEV_AGENT_PLATFORM_URL);
    expect(agentBaseUrl("http://127.0.0.1:3000")).toBe(DEV_AGENT_PLATFORM_URL);
  });

  it("lets through a platform the server can reach", () => {
    expect(agentBaseUrl("https://app.pupitre.studio")).toBe(
      "https://app.pupitre.studio"
    );
    expect(agentBaseUrl("https://staging-app.pupitre.studio")).toBe(
      "https://staging-app.pupitre.studio"
    );
  });
});
