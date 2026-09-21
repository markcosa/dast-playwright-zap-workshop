import { test, expect } from '../support/fixtures';

test.describe('Mi cuenta', () => {
  test('busca movimientos por concepto', async ({ authedPage: page, dashboard }) => {
    await dashboard.search('super');

    await expect(page.getByTestId('search-title')).toHaveText('Resultados para: super');
    await expect(page.getByTestId('movements')).toContainText('Supermercado');
  });

  test('indica cuando no hay resultados', async ({ authedPage: page, dashboard }) => {
    await dashboard.search('viaje a la luna');
    await expect(page.getByTestId('empty')).toBeVisible();
  });

  test('consulta la API de la cuenta', async ({ authedPage: page }) => {
    // page.request comparte cookies con el navegador y también pasa por ZAP
    const res = await page.request.get('/api/account');
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ name: 'Ana López', account: '0012-3456-7890' });
  });

  test('el reporte mensual muestra un aviso cuando falla', async ({ authedPage: page }) => {
    const response = await page.goto('/reports/monthly');
    expect(response?.status()).toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
