import { describe, expect, it } from "bun:test";
import { looksLikeCommand } from "../remedy";

describe("un remède", () => {
  it("est une commande quand il commence comme une ligne à taper", () => {
    expect(looksLikeCommand("sudo systemctl restart pupitred")).toBe(true);
    expect(
      looksLikeCommand("ssh-copy-id -i ~/.ssh/id_ed25519.pub dev@host")
    ).toBe(true);
    expect(looksLikeCommand("/usr/local/bin/pupitred enroll")).toBe(true);
  });

  it("est une phrase quand il commence par une majuscule ou finit par un point", () => {
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
