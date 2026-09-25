import type { Locator, Page } from "@playwright/test";

/** The app's Select has no native `<select>`: open it and click the option. */
export async function pickOption(
  page: Page,
  field: Locator,
  option: string | RegExp
): Promise<void> {
  await field.click();
  await page.getByRole("option", { name: option }).click();
}

/** By role, so the hidden input the form keeps never answers in its place. */
export function toggle(page: Page, name: string | RegExp): Locator {
  return page.getByRole("switch", { name });
}
