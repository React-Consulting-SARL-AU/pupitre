import { afterEach, describe, expect, it } from "bun:test";
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

  describe("fenêtre cachée", () => {
    type Listener = () => void;

    /** A `document` that says whether it is hidden and can be told to change its mind. */
    function page(hidden: boolean): {
      show: () => void;
      hide: () => void;
      listeners: () => number;
    } {
      const held = new Set<Listener>();
      const fake = {
        hidden,
        addEventListener: (_type: string, listener: Listener) => {
          held.add(listener);
        },
        removeEventListener: (_type: string, listener: Listener) => {
          held.delete(listener);
        },
      };

      (globalThis as { document?: unknown }).document = fake;

      return {
        hide: () => {
          fake.hidden = true;
          for (const listener of held) {
            listener();
          }
        },
        listeners: () => held.size,
        show: () => {
          fake.hidden = false;
          for (const listener of held) {
            listener();
          }
        },
      };
    }

    afterEach(() => {
      (globalThis as { document?: unknown }).document = undefined;
    });

    it("ne lit pas tant que la fenêtre est cachée, et relit dès qu'elle revient", async () => {
      const view = page(true);
      let asked = 0;

      const stop = poll(() => {
        asked += 1;

        return Promise.resolve();
      }, 1);

      await tick(10);
      expect(asked).toBe(0);

      view.show();
      expect(asked).toBe(1);

      await tick(10);
      expect(asked).toBeGreaterThan(1);

      stop();
    });

    it("suspend le battement quand la fenêtre se cache, et n'écoute plus une fois arrêtée", async () => {
      const view = page(false);
      let asked = 0;

      const stop = poll(() => {
        asked += 1;

        return Promise.resolve();
      }, 1);

      await tick(10);
      view.hide();

      const seen = asked;

      await tick(10);
      expect(asked).toBeLessThanOrEqual(seen + 1);

      stop();
      expect(view.listeners()).toBe(0);
    });
  });
});
