import { expect, type Page, test } from "@playwright/test";
import { DARK, LIGHT } from "@pupitre/design/tokens";
import { assertAccessible } from "./harness/accessible";
import { pickOption } from "./harness/controls";
import { launchPupitre, type Running } from "./harness/launch";

const HEADING = "Tableau de bord";
const THEME_OPTION = { dark: "Sombre", light: "Clair" } as const;
const BRANDED = ["db.postgres", "ai.claude", "exposure.cloudflare"];
const BRAND_COLOUR = /^#[0-9a-f]{6}$/;

function rgb(hex: string): string {
  const channels = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16)
  );

  return `rgb(${channels.join(", ")})`;
}

async function dashboardIn(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("tab", { name: "Apparence" }).click();
  await pickOption(page, page.getByLabel("Thème"), THEME_OPTION[theme]);

  await page.getByRole("button", { name: "Tableau de bord" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(
    page.getByRole("heading", { level: 1, name: HEADING })
  ).toBeVisible();
}

test.describe("thèmes", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  // References are kept for macOS only; a Linux runner draws other pixels.
  const compared = process.platform === "darwin";

  async function looksLike(page: Page, name: string): Promise<void> {
    if (compared) {
      await expect(page).toHaveScreenshot(name);
    }
  }

  test("le tableau de bord se rend en clair puis en sombre", async () => {
    const { page } = running;

    await expect(
      page.getByRole("heading", { level: 1, name: HEADING })
    ).toBeVisible();

    await test.step("les services portent leur marque", async () => {
      for (const moduleId of BRANDED) {
        const logo = page.locator(`[data-logo="${moduleId}"] svg`).first();

        await expect(logo).toHaveAttribute("fill", BRAND_COLOUR);
      }
    });

    await test.step("en clair", async () => {
      await dashboardIn(page, "light");
      await looksLike(page, "tableau-de-bord-clair.png");
      await assertAccessible(page, "tableau-de-bord/clair");
    });

    await test.step("en sombre", async () => {
      await dashboardIn(page, "dark");
      await looksLike(page, "tableau-de-bord-sombre.png");
      await assertAccessible(page, "tableau-de-bord/sombre");
    });
  });

  test("une sélection dans un champ se voit dans les deux thèmes", async () => {
    const { page } = running;

    for (const [theme, tokens] of [
      ["light", LIGHT],
      ["dark", DARK],
    ] as const) {
      const field = page.getByLabel("Thème");

      await page.getByRole("button", { name: "Réglages" }).click();
      await page.getByRole("tab", { name: "Apparence" }).click();
      await pickOption(page, field, THEME_OPTION[theme]);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const highlight = await field.evaluate((node) => {
        const selection = getComputedStyle(node, "::selection");

        return {
          background: selection.backgroundColor,
          color: selection.color,
        };
      });

      expect(highlight).toEqual({
        background: rgb(tokens.inverse),
        color: rgb(tokens["inverse-ink"]),
      });
    }
  });

  test("le fond natif de la fenêtre suit le thème forcé", async () => {
    const { app, page } = running;

    for (const [theme, token] of [
      ["light", LIGHT.base],
      ["dark", DARK.base],
    ] as const) {
      await dashboardIn(page, theme);

      const frame = await app.evaluate(({ BrowserWindow, nativeTheme }) => ({
        background: BrowserWindow.getAllWindows()[0]?.getBackgroundColor(),
        source: nativeTheme.themeSource,
      }));

      expect(frame.source).toBe(theme);
      expect(frame.background?.toLowerCase()).toBe(token);
    }
  });
});
