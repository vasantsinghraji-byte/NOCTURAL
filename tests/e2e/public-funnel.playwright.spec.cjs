const { test, expect } = require('playwright/test');

test.describe('public conversion funnel', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/funnel-events', async (route) => {
      await route.fulfill({ status: 204, body: '' });
    });

    await page.route('**/api/v1/patients/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          patient: { id: 'patient-id', name: 'Test Patient', email: 'patient@example.com' }
        })
      });
    });

    await page.route('**/api/v1/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: 'provider-id', name: 'Test Provider', email: 'provider@example.com', role: 'nurse' }
        })
      });
    });

    await page.route('**/api/v1/hospital-waitlist', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          leadId: 'lead-id',
          message: 'You are on the hospital waitlist.'
        })
      });
    });
  });

  test('homepage CTAs route to patient, provider, and hospital waitlist flows', async ({ page }) => {
    await page.goto('/index.html');

    await page.getByRole('button', { name: /book home care/i }).first().click();
    await expect(page).toHaveURL(/\/roles\/patient\/patient-register\.html/);
    await expect(page.getByRole('heading', { name: /Nocturnal Healthcare/i })).toBeVisible();

    await page.goto('/index.html');
    await page.getByRole('button', { name: /join as provider/i }).click();
    await expect(page).toHaveURL(/\/shared\/register\.html/);
    await expect(page.getByRole('heading', { name: /Healthcare Professional/i })).toBeVisible();

    await page.goto('/index.html');
    await page.getByRole('button', { name: /hospital pilot waitlist/i }).click();
    await expect(page).toHaveURL(/\/shared\/register\.html#hospital-waitlist/);
    await expect(page.getByRole('button', { name: /join hospital pilot waitlist/i })).toBeVisible();
  });

  test('patient registration submits and reaches the protected patient flow', async ({ page }) => {
    await page.goto('/roles/patient/patient-register.html');

    await page.getByLabel(/full name/i).fill('Test Patient');
    await page.getByLabel(/phone number/i).fill('9876543210');
    await page.getByLabel(/email address/i).fill('patient@example.com');
    await page.getByLabel(/^password/i).fill('Password@1');
    await page.getByLabel(/confirm password/i).fill('Password@1');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/roles\/patient\/patient-(dashboard|login)\.html/);
  });

  test('provider registration submits and redirects by role to onboarding', async ({ page }) => {
    await page.goto('/shared/register.html');

    await page.locator('#doctorName').fill('Test Provider');
    await page.locator('#doctorEmail').fill('provider@example.com');
    await page.locator('#doctorPhone').fill('+919876543210');
    await page.locator('#doctorRole').selectOption('nurse');
    await page.locator('#doctorPassword').fill('Password@1');
    await page.locator('#doctorConfirmPassword').fill('Password@1');
    await page.locator('#doctorAgreeTerms').check();
    await page.locator('#doctorSubmitBtn').click();

    await expect(page).toHaveURL(/\/roles\/doctor\/doctor-onboarding\.html/);
  });

  test('hospital waitlist form submits and shows confirmation', async ({ page }) => {
    await page.goto('/shared/register.html#hospital-waitlist');

    await page.locator('#hospitalName').fill('City General Hospital');
    await page.locator('#hospitalFacilityType').selectOption('hospital');
    await page.locator('#hospitalContactName').fill('Admin User');
    await page.locator('#hospitalEmail').fill('admin@example.com');
    await page.locator('#hospitalPhone').fill('+919876543210');
    await page.locator('#hospitalLocation').fill('Mumbai');
    await page.locator('#hospitalState').fill('Maharashtra');
    await page.locator('#hospitalExpectedNeed').fill('Night duty nurses');
    await page.getByRole('button', { name: /join hospital pilot waitlist/i }).click();

    await expect(page.getByText(/you are on the hospital waitlist/i)).toBeVisible();
  });
});
