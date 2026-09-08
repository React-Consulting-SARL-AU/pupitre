import { describe, expect, it } from "bun:test";
import {
  hostKeyDecision,
  looksLikeHostKeyChange,
  REINSTALLED_ACTION,
} from "../host-keys";

const PINNED = "SHA256:5ZmC0Tn0eYxJ0nR1cLcQK1a7q0mCq0k9YkGqiJ2b3Xk";
const OTHER = "SHA256:t9bB1v2n3M4c5X6z7A8s9D0f1G2h3J4k5L6m7N8o9P0";

describe("la décision sur la clé d'hôte", () => {
  it("appelle premier contact ce qui n'a jamais été épinglé", () => {
    expect(hostKeyDecision(undefined, null)).toEqual({
      status: "first_contact",
    });
    expect(hostKeyDecision(undefined, PINNED)).toEqual({
      status: "first_contact",
    });
  });

  it("fait confiance à l'empreinte qui n'a pas bougé", () => {
    expect(hostKeyDecision(PINNED, PINNED)).toEqual({
      fingerprint: PINNED,
      status: "trusted",
    });
  });

  it("refuse la connexion quand l'empreinte a changé, en disant laquelle", () => {
    const decision = hostKeyDecision(PINNED, OTHER);

    expect(decision.status).toBe("changed");
    if (decision.status !== "changed") {
      return;
    }
    expect(decision.expected).toBe(PINNED);
    expect(decision.observed).toBe(OTHER);
    expect(decision.phrase.id).toBe("refusal.hostKey.changed");
  });

  it("refuse aussi quand l'empreinte épinglée a disparu du fichier de l'app", () => {
    const decision = hostKeyDecision(PINNED, null);

    expect(decision.status).toBe("changed");
    if (decision.status === "changed") {
      expect(decision.observed).toBe(null);
    }
  });

  it("propose de remplacer l'empreinte, et rien d'autre", () => {
    const decision = hostKeyDecision(PINNED, OTHER);

    if (decision.status !== "changed") {
      throw new Error("attendu : changed");
    }
    expect(decision.actions).toEqual([REINSTALLED_ACTION, "cancel"]);
  });
});

describe("le refus que ssh renvoie", () => {
  it("se reconnaît à l'avertissement d'OpenSSH", () => {
    expect(
      looksLikeHostKeyChange(
        "@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@"
      )
    ).toBe(true);
    expect(looksLikeHostKeyChange("Host key verification failed.")).toBe(true);
  });

  it("ne confond pas un refus de mot de passe avec un changement de clé", () => {
    expect(looksLikeHostKeyChange("Permission denied (publickey).")).toBe(
      false
    );
  });
});
