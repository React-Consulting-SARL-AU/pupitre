import { describe, expect, it } from "bun:test";
import {
  compareVersions,
  floorOf,
  orderOf,
  verdictOf,
  versionCore,
} from "../agent-update";

describe("la lecture d'une version", () => {
  it("accepte le semver, avec ou sans v, avec ou sans suffixe", () => {
    expect(versionCore("0.4.0")).toEqual([0, 4, 0]);
    expect(versionCore("v1.12.3")).toEqual([1, 12, 3]);
    expect(versionCore("2.0.0-beta.1")).toEqual([2, 0, 0]);
  });

  it("refuse ce qui n'en est pas", () => {
    expect(versionCore("g4c9f2a")).toBeNull();
    expect(versionCore("dev")).toBeNull();
  });
});

describe("la comparaison", () => {
  it("compare champ par champ, pas caractère par caractère", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.1.0")).toBe(-1);
  });

  it("ne compare pas une version qu'elle ne sait pas lire", () => {
    expect(compareVersions("0.4.0", "g4c9f2a")).toBeNull();
  });
});

describe("l'ordre annoncé à l'écran", () => {
  it("dit ce que l'app peut offrir, ce qu'elle doit demander, ou rien", () => {
    expect(orderOf("0.4.0", "0.3.0")).toBe("ahead");
    expect(orderOf("0.3.0", "0.9.0")).toBe("behind");
    expect(orderOf("0.3.0", "0.3.0")).toBe("same");
  });

  it("reste muette sur une machine sans agent ou une version illisible", () => {
    expect(orderOf("0.4.0", null)).toBe("unknown");
    expect(orderOf(null, "0.3.0")).toBe("unknown");
    expect(orderOf("0.4.0", "dev")).toBe("unknown");
  });
});

// A 0.9.x agent still answers hello but its own agent.upgrade would roll a 1.0 back: the reinstall pushes it instead.
describe("la 1.0 face à un agent 0.9", () => {
  it("le juge trop ancien et nomme la 1.0 comme plancher", () => {
    expect(verdictOf("1.0.0", "0.9.1")).toBe("agent_too_old");
    expect(floorOf("1.0.0")).toBe("1.0.0");
  });

  it("garde une app 0.9 d'accord avec son agent 0.9", () => {
    expect(verdictOf("0.9.1", "0.9.1")).toBe("ok");
    expect(verdictOf("0.9.1", "1.0.0")).toBe("app_too_old");
  });
});
