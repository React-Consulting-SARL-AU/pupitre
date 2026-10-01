import { describe, expect, it } from "bun:test";
import { helpUrl } from "../help-links";

const FACTS = {
  arch: "arm64",
  platform: "darwin" as NodeJS.Platform,
  system: "15.2",
  version: "0.9.1",
};

describe("the help links", () => {
  it("lead to the site's documentation and terms, in the requested language", () => {
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

  it("write to support with the app and system versions, and nothing personal", () => {
    const mail = new URL(helpUrl("support", { ...FACTS, language: "fr" }));

    expect(mail.protocol).toBe("mailto:");
    expect(mail.pathname).toBe("support@pupitre.studio");
    expect(mail.searchParams.get("subject")).toBe("Support Pupitre");
    expect(mail.searchParams.get("body")).toContain(
      "Pupitre 0.9.1 · macOS 15.2 · arm64"
    );
  });
});
