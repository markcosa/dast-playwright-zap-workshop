import { test, expect, USERS } from '../support/fixtures';

test.describe('Autenticación', () => {
  test('inicia sesión con credenciales válidas', async ({ page, loginPage, dashboard }) => {
    await loginPage.goto();
    await loginPage.login(USERS.ana.username, USERS.ana.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`Hola, ${USERS.ana.name}`)).toBeVisible();
    await expect(dashboard.balance()).toContainText('$');
  });

  test('muestra error con contraseña incorrecta', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.ana.username, 'incorrecta');

    await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('cierra sesión y protege las páginas privadas', async ({ authedPage: page }) => {
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
