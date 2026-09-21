import { test, expect } from '../support/fixtures';

test.describe('Foro', () => {
  test('un visitante ve el foro pero no puede publicar', async ({ page }) => {
    await page.goto('/comments');
    await expect(page.getByTestId('comments')).toContainText('Bienvenido al foro');
    await expect(page.getByRole('button', { name: 'Publicar comentario' })).toHaveCount(0);
  });

  test('un cliente publica un comentario', async ({ authedPage: page }) => {
    const text = `Excelente servicio ${Date.now()}`;
    await page.getByRole('link', { name: 'Foro' }).click();
    await page.getByLabel('Escribe un comentario').fill(text);
    await page.getByRole('button', { name: 'Publicar comentario' }).click();

    await expect(page.getByTestId('comments')).toContainText(text);
  });
});
