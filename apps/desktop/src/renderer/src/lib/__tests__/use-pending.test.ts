import { describe, expect, it } from "bun:test";
import { awaited } from "../use-pending";

describe("le travail qu'un geste a lancé", () => {
  it("n'attend rien d'un geste qui a déjà tout fait", () => {
    const seen: boolean[] = [];

    expect(awaited(undefined, (pending) => seen.push(pending))).toBeNull();
    expect(awaited(42, (pending) => seen.push(pending))).toBeNull();
    expect(seen).toEqual([]);
  });

  it("attend une promesse jusqu'à sa réponse", async () => {
    const seen: boolean[] = [];

    await awaited(Promise.resolve("ok"), (pending) => seen.push(pending));

    expect(seen).toEqual([true, false]);
  });

  it("libère le bouton sur un échec, et rend l'échec plutôt que de l'avaler", async () => {
    const seen: boolean[] = [];
    const failure = new Error("the bridge did not answer");

    const outcome = awaited(Promise.reject(failure), (pending) =>
      seen.push(pending)
    );

    await expect(outcome).rejects.toBe(failure);
    expect(seen).toEqual([true, false]);
  });
});
