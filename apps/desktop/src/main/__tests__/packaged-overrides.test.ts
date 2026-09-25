import { describe, expect, it } from "bun:test";
import { harnessOn } from "../dev-data-run";
import {
  agentPlatformUrlOf,
  DEFAULT_PLATFORM_URL,
  LOCAL_PLATFORM_URL,
  platformUrlOf,
} from "../platform-client";

const PACKAGED = () => true;
const FROM_FOLDER = () => false;

describe("ce que l'environnement peut changer d'un build empaqueté", () => {
  it("ne laisse un scénario conduire l'app que depuis un dossier de développement", () => {
    expect(harnessOn("1", FROM_FOLDER)).toBe(true);
    expect(harnessOn("1", PACKAGED)).toBe(false);
    expect(harnessOn(undefined, FROM_FOLDER)).toBe(false);
  });

  it("ne demande pas si l'app est empaquetée quand aucun scénario n'est demandé", () => {
    expect(
      harnessOn(undefined, () => {
        throw new Error("asked");
      })
    ).toBe(false);
  });

  it("parle à la plateforme hébergée, quoi que dise PUPITRE_PLATFORM_URL", () => {
    expect(platformUrlOf(true, "https://evil.example")).toBe(
      DEFAULT_PLATFORM_URL
    );
    expect(platformUrlOf(true, undefined)).toBe(DEFAULT_PLATFORM_URL);
  });

  it("suit PUPITRE_PLATFORM_URL en développement, la console locale sinon", () => {
    expect(platformUrlOf(false, "https://app.pupitre.studio")).toBe(
      "https://app.pupitre.studio"
    );
    expect(platformUrlOf(false, undefined)).toBe(LOCAL_PLATFORM_URL);
    expect(platformUrlOf(false, "")).toBe(LOCAL_PLATFORM_URL);
  });

  it("donne à l'agent la plateforme de l'app une fois empaquetée", () => {
    expect(
      agentPlatformUrlOf(true, "https://evil.example", DEFAULT_PLATFORM_URL)
    ).toBe(new URL("/api/v1", DEFAULT_PLATFORM_URL).toString());
    expect(
      agentPlatformUrlOf(
        false,
        "https://agent.example",
        "https://app.pupitre.studio"
      )
    ).toBe("https://agent.example/api/v1");
  });
});
