import { describe, expect, it } from "bun:test";
import { translator } from "../../i18n/i18n";
import { stepLabel } from "../step-label";

const t = translator("fr");

describe("an agent step, worded for the reader", () => {
  it("reads a known step as its sentence", () => {
    expect(stepLabel(t, "install-package")).toBe("Installer le paquet");
    expect(stepLabel(t, "write-sshd-fragment")).toBe(
      "Écrire la configuration SSH"
    );
  });

  it("reads a step named after a tool by its verb and the tool", () => {
    expect(stepLabel(t, "install-node-22")).toBe("Installer node-22");
    expect(stepLabel(t, "use-python")).toBe("Utiliser python par défaut");
  });

  it("reads a backup part the way the Backups page names it", () => {
    expect(stepLabel(t, "db:postgres:shop")).toBe("Base shop");
    expect(stepLabel(t, "db:postgres:*")).toBe("Base postgres");
    expect(stepLabel(t, "project:shop")).toBe("Projet shop");
    expect(stepLabel(t, "setup")).toBe("Configuration");
  });

  it("keeps the agent's identifier when nothing translates it", () => {
    expect(stepLabel(t, "calibrate-flux")).toBe("calibrate-flux");
  });
});
