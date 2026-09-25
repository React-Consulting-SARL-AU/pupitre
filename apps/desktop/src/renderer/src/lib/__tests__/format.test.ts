import { describe, expect, it } from "bun:test";
import { count } from "../format";

describe("count", () => {
  it("groups the thousands the way the reader's language writes them", () => {
    expect(count(100_000)).toMatch(/^100\s000$/);
    expect(count(1000)).toMatch(/^1\s000$/);
    expect(count(24)).toBe("24");
  });
});
