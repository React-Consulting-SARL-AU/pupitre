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

describe("the window's content policy", () => {
  it("only runs the app's scripts, with no eval or inline script", () => {
    expect(directives().get("script-src")).toBe("'self'");
  });

  it("shuts off plugins, the base URI and form submission", () => {
    const policy = directives();

    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'none'");
    expect(policy.get("form-action")).toBe("'none'");
  });
});
