import { describe, expect, it } from "bun:test";
import { poll } from "../poll";

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("une lecture répétée", () => {
  it("lit tout de suite, puis attend la réponse avant de compter le délai", async () => {
    let asked = 0;
    let settle: () => void = () => undefined;

    const stop = poll(() => {
      asked += 1;

      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    }, 5);

    expect(asked).toBe(1);

    await tick(20);
    expect(asked).toBe(1);

    settle();
    await tick(20);
    expect(asked).toBe(2);

    stop();
  });

  it("ne relit plus une fois arrêtée, même sur une réponse tardive", async () => {
    let asked = 0;
    let settle: () => void = () => undefined;

    const stop = poll(() => {
      asked += 1;

      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    }, 1);

    stop();
    settle();
    await tick(10);

    expect(asked).toBe(1);
  });
});
