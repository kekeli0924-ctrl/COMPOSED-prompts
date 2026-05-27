import { test, expect } from '@playwright/test';

test('wizard → result → history rate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /start studying/i }).click();
  await expect(page).toHaveURL(/\/wizard/);

  // Step 1: LLM + model
  await page.getByLabel(/which llm/i).click();
  await page.getByRole('option', { name: /claude/i }).click();
  await page.getByLabel(/which model/i).click();
  await page.getByRole('option', { name: /opus/i }).first().click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 2: Course
  await page.getByLabel(/search for your class/i).fill('astro');
  await page.locator('li button').first().click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 3: Mode
  await page.getByLabel(/cram review/i).click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 4: Assessment
  await page.getByLabel(/what kind/i).click();
  await page.getByRole('option', { name: /test/i }).click();
  await page.getByLabel(/how much study time/i).click();
  await page.getByRole('option', { name: /2 hours/i }).click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 5: Material (skip)
  await page.getByRole('button', { name: /next/i }).click();

  // Step 6: About me (skip)
  await page.getByRole('button', { name: /generate prompt/i }).click();

  await expect(page).toHaveURL(/\/wizard\/result/, { timeout: 30_000 });
  await expect(page.getByText(/your prompt is ready/i)).toBeVisible();
  await expect(page.locator('pre')).toContainText(/role|ROLE|<role>/);

  // History
  await page.goto('/history');
  await expect(page.getByText(/past prompts/i)).toBeVisible();
  await expect(page.locator('li').first()).toBeVisible();
});
