import { describe, expect, it } from "bun:test";
import { DEFAULT_PROFILE } from "../profile";

describe("DEFAULT_PROFILE", () => {
  it("drives the dev stack by default", () => {
    expect(DEFAULT_PROFILE.command).toBe("dev");
    expect(DEFAULT_PROFILE.logs).toContain("{project}");
  });
});
