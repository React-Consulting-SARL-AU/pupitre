import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX = join(import.meta.dir, "../../renderer/index.html");

const CSP_RE = /content="([^"]+)"\s+http-equiv="Content-Security-Policy"/;

function directives(): Map<string, string> {
  const policy = readFileSync(INDEX, "utf8").match(CSP_RE)?.[1] ?? "";

  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = "", ...values] = part.split(/\s+/);

        return [name, values.join(" ")] as const;
      })
  );
}

describe("la politique de contenu de la fenêtre", () => {
  it("n'exécute que les scripts de l'app, sans eval ni script en ligne", () => {
    expect(directives().get("script-src")).toBe("'self'");
  });

  it("ferme les plugins, la base des adresses et l'envoi de formulaires", () => {
    const policy = directives();

    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'none'");
    expect(policy.get("form-action")).toBe("'none'");
  });
});
