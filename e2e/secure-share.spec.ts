import { expect, test } from "@playwright/test";

test("a share reveals no document data before Clerk authentication", async ({ page }) => {
  await page.goto("/share/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Protected file" })).toBeVisible();
  await expect(page.getByText("Sign in with the exact email address authorized by the sender.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.locator("text=Download")).toHaveCount(0);
});
