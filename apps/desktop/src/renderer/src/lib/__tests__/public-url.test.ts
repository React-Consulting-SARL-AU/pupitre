import { describe, expect, it } from "bun:test";
import { publicUrl } from "../public-url";

describe("publicUrl", () => {
  it("keeps a name on the web and drops the machine's own address", () => {
    expect(publicUrl("https://shop.example.org")).toBe(
      "https://shop.example.org"
    );
    expect(publicUrl("http://127.0.0.1:8081")).toBeNull();
    expect(publicUrl("http://web.localhost:3000")).toBeNull();
    expect(publicUrl(undefined)).toBeNull();
  });
});
