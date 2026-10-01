import { describe, expect, it } from "bun:test";
import { drawPassphrase, passphraseProblem } from "../backup-passphrase";

describe("the backup passphrase", () => {
  it("refuses a short phrase, then two phrases that differ", () => {
    expect(passphraseProblem("court", "court")).toBe("short");
    expect(
      passphraseProblem("une phrase assez longue", "une phrase assez longu")
    ).toBe("mismatch");
    expect(
      passphraseProblem("une phrase assez longue", "une phrase assez longue")
    ).toBeNull();
  });

  it("draws six groups of four characters without look-alikes, never the same twice", () => {
    const drawn = drawPassphrase();

    expect(drawn).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){5}$/);
    expect(drawPassphrase()).not.toBe(drawn);
    expect(passphraseProblem(drawn, drawn)).toBeNull();
  });
});
