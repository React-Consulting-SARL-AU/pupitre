import { afterEach, describe, expect, it } from "bun:test";
import { useAccount } from "@renderer/stores/account";
import type { AccountState, BuildKind } from "@shared/account";
import { agentText, remedy } from "../agent-error";
import { translator } from "../i18n";

const t = translator("fr");

function built(build: BuildKind): void {
  useAccount.setState({
    view: { account: { build } as AccountState, status: "read" },
  });
}

afterEach(() => {
  useAccount.setState({ view: { status: "unknown" } });
});

describe("le remède d'un refus", () => {
  it("dit au client de réessayer puis d'écrire au support, jamais de publier une version", () => {
    built("production");

    const text = agentText(t, {
      message: "",
      phrase: { id: "refusal.release.none" },
    });

    expect(text).toEqual({
      fix: "Réessayez plus tard ; si ça dure, contactez le support.",
      message:
        "Aucune version de l'agent n'est encore disponible pour cette machine.",
    });
    expect(remedy(t, "updates.agent.unsignedFix")).not.toContain("bun ");
  });

  it("garde le remède du développeur dans un build de développement", () => {
    built("development");

    expect(
      agentText(t, { message: "", phrase: { id: "refusal.release.none" } }).fix
    ).toContain("depuis la console");
    expect(remedy(t, "updates.agent.unsignedFix")).toContain(
      "bun --cwd=apps/agent"
    );
  });

  it("prend le remède du client tant que le compte n'a pas été lu", () => {
    expect(
      agentText(t, { message: "", phrase: { id: "refusal.release.key" } }).fix
    ).not.toContain("clé de signature");
  });
});
