import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByRole('textbox', { name: 'z.B. Alex' }).click();
  await page.getByRole('textbox', { name: 'z.B. Alex' }).fill('hallo');
  await page.getByRole('textbox', { name: 'z.B. Silber Nuzlocke' }).click();
  await page.getByRole('textbox', { name: 'z.B. Silber Nuzlocke' }).fill('testrun');
  await page.locator('#create-protected-toggle').click();
  await page.getByRole('textbox', { name: 'Passwort für diesen Run' }).click();
  await page.getByRole('textbox', { name: 'Passwort für diesen Run' }).fill('testrundev');
  await page.getByRole('button', { name: 'Run erstellen →' }).click();
  await page.getByRole('button', { name: '🎮 Spieler 2' }).click();
  await page.getByRole('button', { name: '📋 Kopieren' }).click();
  await page.getByRole('button', { name: 'Los geht\'s →' }).click();
  await page.getByRole('button', { name: '+' }).click();
  await page.getByRole('button', { name: '−' }).click();
  await page.getByRole('button', { name: '⊟ minimieren' }).click();
  await page.locator('#run-bar-ctrl').getByRole('button', { name: '▶ Run starten' }).click();
  await page.locator('#tab-soullink').click();
  await page.getByText('Box', { exact: true }).click();
  await page.getByText('Routen', { exact: true }).click();
  await page.locator('#edition-sel').selectOption('firered-leafgreen');
});
