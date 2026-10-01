import { describe, expect, it } from "bun:test";
import { type PollPage, poll } from "../poll";

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("a repeated read", () => {
  it("reads right away, then waits for the response before counting the delay", async () => {
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

  it("no longer reads once stopped, even on a late response", async () => {
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

  describe("hidden window", () => {
    type Listener = () => void;

    function page(hidden: boolean): {
      page: PollPage;
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

      return {
        page: fake,
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

    it("does not read while the window is hidden, and reads again as soon as it returns", async () => {
      const view = page(true);
      let asked = 0;

      const stop = poll(
        () => {
          asked += 1;

          return Promise.resolve();
        },
        1,
        view.page
      );

      await tick(10);
      expect(asked).toBe(0);

      view.show();
      expect(asked).toBe(1);

      await tick(10);
      expect(asked).toBeGreaterThan(1);

      stop();
    });

    it("suspends the beat when the window hides, and stops listening once stopped", async () => {
      const view = page(false);
      let asked = 0;

      const stop = poll(
        () => {
          asked += 1;

          return Promise.resolve();
        },
        1,
        view.page
      );

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
