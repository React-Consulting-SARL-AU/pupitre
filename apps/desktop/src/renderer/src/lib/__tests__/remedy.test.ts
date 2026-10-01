import { describe, expect, it } from "bun:test";
import { looksLikeCommand } from "../remedy";

describe("a remedy", () => {
  it("is a command when it starts like a line to type", () => {
    expect(looksLikeCommand("sudo systemctl restart pupitred")).toBe(true);
    expect(
      looksLikeCommand("ssh-copy-id -i ~/.ssh/id_ed25519.pub dev@host")
    ).toBe(true);
    expect(looksLikeCommand("/usr/local/bin/pupitred enroll")).toBe(true);
  });

  it("is a sentence when it starts with a capital letter or ends with a period", () => {
    expect(looksLikeCommand("Vérifiez le port 22.")).toBe(false);
    expect(
      looksLikeCommand(
        "Ouvrez https://app.pupitre.studio : Pupitre est gratuit jusqu'à 3 serveurs par organisation, une licence est requise au-delà."
      )
    ).toBe(false);
    expect(
      looksLikeCommand("ajoute le module ai.hermes depuis Services.")
    ).toBe(false);
  });
});
