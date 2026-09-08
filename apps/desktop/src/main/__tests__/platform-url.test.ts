import { describe, expect, it } from "bun:test";
import {
  agentBaseUrl,
  createPlatformClient,
  DEV_AGENT_PLATFORM_URL,
  isLocalPlatform,
  LOCAL_PLATFORM_URL,
} from "../platform-client";

describe("la plateforme visée en développement", () => {
  it("reconnaît une console servie sur cette machine", () => {
    expect(isLocalPlatform(LOCAL_PLATFORM_URL)).toBe(true);
    expect(isLocalPlatform("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalPlatform("http://[::1]:3000")).toBe(true);
    expect(isLocalPlatform("https://app.pupitre.studio")).toBe(false);
    expect(isLocalPlatform("pas une url")).toBe(false);
  });

  it("dit quoi lancer quand la console locale ne répond pas", async () => {
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

  it("garde le remède habituel pour la plateforme hébergée", async () => {
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

describe("la plateforme donnée à l'agent", () => {
  it("remplace une console locale par le tunnel qui la publie", () => {
    expect(agentBaseUrl(LOCAL_PLATFORM_URL)).toBe(DEV_AGENT_PLATFORM_URL);
    expect(agentBaseUrl("http://127.0.0.1:3000")).toBe(DEV_AGENT_PLATFORM_URL);
  });

  it("laisse passer une plateforme que le serveur peut joindre", () => {
    expect(agentBaseUrl("https://app.pupitre.studio")).toBe(
      "https://app.pupitre.studio"
    );
    expect(agentBaseUrl("https://staging-app.pupitre.studio")).toBe(
      "https://staging-app.pupitre.studio"
    );
  });
});
