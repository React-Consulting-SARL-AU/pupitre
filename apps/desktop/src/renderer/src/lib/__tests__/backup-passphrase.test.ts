import { describe, expect, it } from "bun:test";
import { drawPassphrase, passphraseProblem } from "../backup-passphrase";

describe("la phrase de passe des sauvegardes", () => {
  it("refuse une phrase courte, puis deux phrases qui diffèrent", () => {
    expect(passphraseProblem("court", "court")).toBe("short");
    expect(
      passphraseProblem("une phrase assez longue", "une phrase assez longu")
    ).toBe("mismatch");
    expect(
      passphraseProblem("une phrase assez longue", "une phrase assez longue")
    ).toBeNull();
  });

  it("tire six groupes de quatre signes sans sosies, jamais deux fois la même", () => {
    const drawn = drawPassphrase();

    expect(drawn).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){5}$/);
    expect(drawPassphrase()).not.toBe(drawn);
    expect(passphraseProblem(drawn, drawn)).toBeNull();
  });
});
