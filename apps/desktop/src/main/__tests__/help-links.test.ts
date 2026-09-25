import { describe, expect, it } from "bun:test";
import { helpUrl } from "../help-links";

const FACTS = {
  arch: "arm64",
  platform: "darwin" as NodeJS.Platform,
  system: "15.2",
  version: "0.9.1",
};

describe("les liens de l'aide", () => {
  it("mène à la documentation et aux conditions du site, dans la langue demandée", () => {
    expect(helpUrl("docs", { ...FACTS, language: "en" })).toBe(
      "https://pupitre.studio/docs"
    );
    expect(helpUrl("docs", { ...FACTS, language: "fr" })).toBe(
      "https://pupitre.studio/fr/docs"
    );
    expect(helpUrl("legal", { ...FACTS, language: "fr" })).toBe(
      "https://pupitre.studio/fr/legal"
    );
  });

  it("écrit au support avec la version de l'app et du système, et rien de personnel", () => {
    const mail = new URL(helpUrl("support", { ...FACTS, language: "fr" }));

    expect(mail.protocol).toBe("mailto:");
    expect(mail.pathname).toBe("support@pupitre.studio");
    expect(mail.searchParams.get("subject")).toBe("Support Pupitre");
    expect(mail.searchParams.get("body")).toContain(
      "Pupitre 0.9.1 · macOS 15.2 · arm64"
    );
  });
});
