import { test, expect } from '../support/fixtures';

test.describe('Transferencias', () => { // test funcional de transfencia 150 pesos
  test('transfiere a otro usuario y descuenta el saldo', async ({ authedPage: page, dashboard }) => {
    const before = await dashboard.balanceValue();

    await page.getByRole('link', { name: 'Transferir' }).click();
    await page.getByLabel('Usuario destino').fill('luis');
    await page.getByLabel('Monto (MXN)').fill('150');
    await page.getByRole('button', { name: 'Transferir' }).click();

    await expect(page.getByRole('status')).toHaveText('Transferiste $150 a luis.');

    await page.goto('/dashboard');
    expect(await dashboard.balanceValue()).toBeCloseTo(before - 150, 2);
  });

  test('rechaza una cuenta destino inexistente', async ({ authedPage: page }) => {
    await page.goto('/transfer');
    await page.getByLabel('Usuario destino').fill('pato-fantasma');
    await page.getByLabel('Monto (MXN)').fill('10');
    await page.getByRole('button', { name: 'Transferir' }).click();

    await expect(page.getByRole('alert')).toHaveText('La cuenta destino no existe.');
  });
});
