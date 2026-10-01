import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

const FAMILY = "Bricolage Grotesque";
const REMOTE = /^https?:/;

test.describe("display font", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  // The font is not installed and the harness is offline: only the bundled file can draw it.
  test("a title is drawn in the bundled font, with no network request", async () => {
    const heading = running.page.getByRole("heading", { level: 1 }).first();

    await expect(heading).toBeVisible();

    const drawn = await heading.evaluate((node) => {
      const style = getComputedStyle(node);
      const measure = (family: string): number => {
        const context = document.createElement("canvas").getContext("2d");

        if (!context) {
          return 0;
        }

        context.font = `${style.fontWeight} ${style.fontSize} ${family}`;

        return context.measureText(node.textContent ?? "").width;
      };

      return {
        asked: style.fontFamily,
        display: measure('"Bricolage Grotesque"'),
        faces: [...document.fonts].map(
          (face) => `${face.family} ${face.weight} ${face.status}`
        ),
        fallback: measure("-apple-system"),
        fetched: performance
          .getEntriesByType("resource")
          .map((entry) => entry.name),
      };
    });

    expect(drawn.asked).toContain(FAMILY);
    expect(drawn.faces).toContain(`${FAMILY} 700 loaded`);
    expect(drawn.display).not.toBe(drawn.fallback);
    expect(drawn.fetched.filter((name) => REMOTE.test(name))).toEqual([]);
  });
});
