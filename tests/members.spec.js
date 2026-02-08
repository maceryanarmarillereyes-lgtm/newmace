const { test, expect } = require('@playwright/test');

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

test('Members paint dropdown + fullscreen controls', async ({ page }) => {
  const baseUrl = normalizeBaseUrl(
    process.env.MEMBERS_BASE_URL || process.env.VERCEL_URL || process.env.CLOUDFLARE_URL
  );
  const email = process.env.MEMBERS_USER_EMAIL || process.env.UAT_USER_EMAIL || process.env.PROD_USER_EMAIL;
  const password = process.env.MEMBERS_USER_PASSWORD || process.env.UAT_USER_PASSWORD || process.env.PROD_USER_PASSWORD;

  test.skip(!baseUrl || !email || !password, 'Missing MEMBERS_* or deploy login environment variables.');

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#login', email);
  await page.fill('#password', password);
  await page.click('#loginBtn');

  await expect(page.locator('#logoutBtn')).toBeVisible({ timeout: 20000 });

  await page.goto(`${baseUrl}/#members`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#membersAppWrap')).toBeVisible({ timeout: 20000 });

  const fullscreenBtn = page.locator('#membersFullscreenBtn');
  await fullscreenBtn.click();
  await expect(page.locator('body')).toHaveClass(/members-fullscreen-active/);

  const paintToggle = page.locator('#paintToggle');
  await paintToggle.click();
  await expect(paintToggle).toHaveAttribute('aria-pressed', 'true');

  const selectionToggle = page.locator('#selectionToggle');
  await selectionToggle.click();
  await expect(selectionToggle).toHaveAttribute('aria-pressed', 'true');

  const options = page.locator('#paintRole option');
  const optionCount = await options.count();
  expect(optionCount).toBeGreaterThan(0);

  for (let i = 0; i < optionCount; i += 1) {
    const style = await options.nth(i).getAttribute('style');
    expect(style || '').toContain('radial-gradient');
  }

  await fullscreenBtn.click();
  await expect(page.locator('body')).not.toHaveClass(/members-fullscreen-active/);
});
