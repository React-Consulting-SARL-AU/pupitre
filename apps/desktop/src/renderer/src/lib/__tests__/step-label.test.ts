import { describe, expect, it } from "bun:test";
import { translator } from "../../i18n/i18n";
import { stepLabel } from "../step-label";

const t = translator("fr");

describe("une étape de l'agent, dite pour le lecteur", () => {
  it("lit une étape connue dans sa phrase", () => {
    expect(stepLabel(t, "install-package")).toBe("Installer le paquet");
    expect(stepLabel(t, "write-sshd-fragment")).toBe(
      "Écrire la configuration SSH"
    );
  });

  it("lit une étape nommée d'après un outil par son verbe et l'outil", () => {
    expect(stepLabel(t, "install-node-22")).toBe("Installer node-22");
    expect(stepLabel(t, "use-python")).toBe("Utiliser python par défaut");
  });

  it("lit une partie de sauvegarde comme la page Sauvegardes la nomme", () => {
    expect(stepLabel(t, "db:postgres:shop")).toBe("Base shop");
    expect(stepLabel(t, "db:postgres:*")).toBe("Base postgres");
    expect(stepLabel(t, "project:shop")).toBe("Projet shop");
    expect(stepLabel(t, "setup")).toBe("Configuration");
  });

  it("garde l'identifiant de l'agent quand rien ne le traduit", () => {
    expect(stepLabel(t, "calibrate-flux")).toBe("calibrate-flux");
  });
});
