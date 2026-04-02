import { expect, test } from '@playwright/test';

async function login(page, email, password) {
  await page.goto('/login');
  await page.getByPlaceholder('name@beispiel.de').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('superadmin can create a new tenant from tenant management', async ({ page }) => {
  const tenantName = `E2E Tenant ${Date.now()}`;

  await login(page, 'superadmin@fabu.test', 'Secret123!');
  await page.goto('/admin/tenants');

  await page.getByPlaceholder('Neuer Mandantenname').fill(tenantName);
  await page.getByRole('button', { name: 'Neuer Mandant' }).click();

  await expect(page.getByText(tenantName)).toBeVisible();
});

test('tenant admin request becomes visible and can be approved by superadmin', async ({ page }) => {
  const unique = Date.now();
  const tenantName = `Request Tenant ${unique}`;
  const requestEmail = `request-${unique}@example.test`;
  const requestPassword = 'Secret123!';

  await page.goto('/tenant-admin-request');
  await page.getByPlaceholder('Name', { exact: true }).fill('Request Admin');
  await page.getByPlaceholder('E-Mail').fill(requestEmail);
  await page.getByPlaceholder('Gewünschter Name Ihres Angebots').fill(tenantName);
  await page.getByPlaceholder('Passwort (falls noch nicht registriert)').fill(requestPassword);
  await page.getByPlaceholder('Nachricht (optional)').fill('Bitte freischalten');
  await page.getByRole('button', { name: 'Anfrage senden' }).click();

  await expect(page.getByText('Anfrage wurde gesendet. Der Super-Admin prüft sie zeitnah.')).toBeVisible();

  await login(page, 'superadmin@fabu.test', 'Secret123!');
  await page.goto('/admin/tenants');

  await expect(page.getByText(tenantName)).toBeVisible();
  const requestCard = page.locator('div').filter({ hasText: tenantName }).filter({ hasText: requestEmail }).first();
  await expect(requestCard).toBeVisible();
  await requestCard.getByRole('button', { name: 'Annehmen' }).click();

  await expect(page.getByText('Anfrage angenommen und Mandant/Administrator angelegt')).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem('fabu_token');
    localStorage.removeItem('fabu_user');
    localStorage.removeItem('fabu_tenants');
  });
  await login(page, requestEmail, requestPassword);
  await expect(page.getByText('Hallo, Request')).toBeVisible();
});

test('tenant admin can create a vehicle', async ({ page }) => {
  const vehicleName = `E2E Wagen ${Date.now()}`;
  const licensePlate = `E2E-${Date.now()}`;

  await login(page, 'admin@alpha.test', 'Secret123!');
  await page.goto('/vehicles');

  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByPlaceholder('z. B. VW Golf').fill(vehicleName);
  await page.getByPlaceholder('z. B. M-AB 1234').fill(licensePlate);
  await page.getByPlaceholder('z. B. 0.35').fill('0.45');
  await page.getByPlaceholder('Optional...').fill('Automatisch angelegtes E2E-Fahrzeug');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByText('Fahrzeug wurde hinzugefügt')).toBeVisible();
  await expect(page.getByText(vehicleName)).toBeVisible();
});

test('tenant user can create a reservation for an existing vehicle', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const reason = `E2E Reservierung ${Date.now()}`;

  await login(page, 'user@alpha.test', 'Secret123!');
  await page.goto('/reservations/new');

  await page.locator('label').filter({ hasText: 'Seed Car' }).first().click();
  await page.locator('input[type="date"]').first().fill(today);
  await page.locator('input[type="date"]').nth(1).fill(today);
  await page.locator('input[type="time"]').first().fill('09:00');
  await page.locator('input[type="time"]').nth(1).fill('10:00');
  await expect(page.getByText('Fahrzeug verfügbar')).toBeVisible();
  await page.getByPlaceholder('z. B. Kundentermin bei Firma XY, Lieferung Lager, Behördengang...').fill(reason);
  await page.getByRole('button', { name: 'Reservierung erstellen' }).click();

  await expect(page).toHaveURL(/\/reservations$/);
  await expect(page.getByText(reason)).toBeVisible();
});