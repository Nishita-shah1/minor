import { expect, test } from "@playwright/test";

test("theme follows the system and persists an explicit keyboard choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Dark mode" });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("html")).toHaveClass(/light/);

  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.goto("/share/00000000-0000-4000-8000-000000000000");
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toHaveCSS("color", "rgb(0, 0, 0)");
});

test("mobile theme control stays on screen with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Dark mode" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeEnabled();
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y).toBeLessThan(64);
  await toggle.click();
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
