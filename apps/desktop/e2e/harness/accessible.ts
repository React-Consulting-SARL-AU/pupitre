import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

// Injected rather than via its Playwright wrapper, which opens a page Electron cannot give it.
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
  // Mid-animation colours fail contrast; infinite loops (progress dots) never finish, so skip them.
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
