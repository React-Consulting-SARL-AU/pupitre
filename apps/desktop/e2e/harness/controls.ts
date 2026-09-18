import type { Locator, Page } from "@playwright/test";

/**
 * The controls the app draws itself, reached the way a reader reaches them.
 *
 * A `Select` is a button and a list: the option is clicked in the list rather
 * than set on a `<select>`, because there is none. A switch is a switch, not
 * a checkbox: it is found by its role, so the hidden input the form keeps
 * never answers in its place.
 */
export async function pickOption(
  page: Page,
  field: Locator,
  option: string | RegExp
): Promise<void> {
  await field.click();
  await page.getByRole("option", { name: option }).click();
}

export function toggle(page: Page, name: string | RegExp): Locator {
  return page.getByRole("switch", { name });
}
