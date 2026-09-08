import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * What an automated pass can say about a screen.
 *
 * It catches the things a machine is good at: a control with no name, a field
 * whose caption is tied to nothing, a contrast below the floor. It says nothing
 * about whether the screen makes sense — that is what the rest of the scenario
 * is for. Serious and critical violations fail; the rest is left to a human,
 * because a rule can be right in general and wrong here.
 *
 * `axe-core` is injected rather than driven through its Playwright wrapper: the
 * wrapper opens a page of its own to reach frames, and Electron has no such
 * target. This window has no frames either, so nothing is lost.
 */

const require = createRequire(import.meta.url);

const SOURCE = readFileSync(
  join(dirname(require.resolve("axe-core/package.json")), "axe.min.js"),
  "utf8"
);

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface Violation {
  id: string;
  help: string;
  impact: string | null;
  nodes: unknown[];
}

export async function assertAccessible(page: Page, screen: string) {
  // A block still rising is a colour still blending into its background: what
  // would be measured is a frame nobody reads, not the screen. The one looping
  // animation of the system means "in progress" and never ends, so it is left
  // out — a dot that breathes is a dot, not a colour on its way somewhere.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter(
        (one) =>
          (one.effect?.getTiming().iterations ?? 1) !== Number.POSITIVE_INFINITY
      )
      .every((one) => one.playState === "finished" || one.playState === "idle")
  );

  await page.evaluate(SOURCE);

  const violations = (await page.evaluate(async (tags) => {
    const runner = (
      globalThis as { axe?: { run: (o: unknown) => Promise<unknown> } }
    ).axe;

    const answer = (await runner?.run({
      runOnly: { type: "tag", values: tags },
    })) as { violations: Violation[] } | undefined;

    return answer?.violations ?? [];
  }, TAGS)) as Violation[];

  const serious = violations.filter(
    (one) => one.impact === "serious" || one.impact === "critical"
  );

  const said = serious
    .map(
      (one) =>
        `${one.id}: ${one.help}\n${one.nodes
          .map((node) => {
            const one = node as {
              html?: string;
              any?: { data?: Record<string, unknown> }[];
            };
            const data = one.any?.[0]?.data ?? {};

            return `  ${one.html ?? ""} ${JSON.stringify(data)}`;
          })
          .join("\n")}`
    )
    .join("\n");

  expect(`${screen}\n${said}`.trim()).toBe(screen);
}

/** The order the keyboard walks a screen in, by whatever names each control. */
export function tabOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const focusable = document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    return [...focusable]
      .filter((one) => one.offsetParent !== null)
      .map(
        (one) =>
          one.getAttribute("aria-label") ??
          one.getAttribute("name") ??
          one.textContent?.trim().slice(0, 40) ??
          one.tagName.toLowerCase()
      );
  });
}
