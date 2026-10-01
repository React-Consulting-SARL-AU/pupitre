import { describe, expect, it } from "bun:test";
import { agentText } from "../agent-error";
import { translator } from "../i18n";

const REFUSAL = {
  message: "consent required",
  phrase: {
    id: "refusal.account.consent",
    values: { console: "https://app.pupitre.studio/auth/consent" },
  },
};

describe("the refusal for want of a data consent", () => {
  it("sends to the console's consent page, in English", () => {
    const said = agentText(translator("en"), REFUSAL);

    expect(said.message).toContain("Cloudflare, in the United States");
    expect(said.fix).toBe(
      "Open the console to read what is stored and give your agreement: https://app.pupitre.studio/auth/consent"
    );
  });

  it("sends to the console's consent page, in French", () => {
    const said = agentText(translator("fr"), REFUSAL);

    expect(said.message).toContain("Cloudflare, aux États-Unis");
    expect(said.fix).toBe(
      "Ouvrez la console pour lire ce qui est stocké et donner votre accord : https://app.pupitre.studio/auth/consent"
    );
  });
});
