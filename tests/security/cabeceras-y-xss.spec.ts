/**
 * Aserciones de seguridad "hechas a mano" con Playwright.
 * Complementan a ZAP: son deterministas y dan un mensaje de error preciso.
 * En SECURE_MODE=false FALLAN a propósito (ejercicio del taller).
 */
import { test, expect } from '../support/fixtures';

test.describe('Cabeceras de seguridad', () => {
  const required: Record<string, RegExp> = {
    'content-security-policy': /default-src 'self'/,
    'x-frame-options': /DENY|SAMEORIGIN/i,
    'x-content-type-options': /nosniff/i,
    'referrer-policy': /.+/,
    'permissions-policy': /.+/,
  };

  for (const [header, pattern] of Object.entries(required)) {
    test(`responde con ${header}`, async ({ request }) => {
      const res = await request.get('/');
      expect(res.headers()[header], `Falta la cabecera ${header}`).toMatch(pattern);
    });
  }

  test('no revela tecnología ni versión del servidor', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-powered-by']).toBeUndefined();
    expect(headers['server'] ?? '').not.toMatch(/\d/);
  });
});

test.describe('Sesión', () => {
  test('la cookie de sesión es HttpOnly y SameSite', async ({ authedPage: page }) => {
    const session = (await page.context().cookies()).find((c) => c.name === 'sessionid');
    expect(session, 'No se encontró la cookie sessionid').toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(['Strict', 'Lax']).toContain(session!.sameSite);
  });
});

test.describe('XSS', () => {
  const payload = '<img src=x onerror="window.__xss=1">';

  test('la búsqueda escapa la entrada del usuario (XSS reflejado)', async ({ authedPage: page }) => {
    await page.goto(`/search?q=${encodeURIComponent(payload)}`);
    await expect(page.getByTestId('search-title')).toHaveText(`Resultados para: ${payload}`);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test('los comentarios se muestran como texto (XSS almacenado)', async ({ authedPage: page }) => {
    await page.goto('/comments');
    await page.getByLabel('Escribe un comentario').fill(payload);
    await page.getByRole('button', { name: 'Publicar comentario' }).click();
    await expect(page.getByTestId('comments')).toContainText(payload);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });
});

test.describe('Manejo de errores', () => {
  test('no expone stack traces ni IPs internas', async ({ authedPage: page }) => {
    await page.goto('/reports/monthly');
    const html = await page.content();
    expect(html).not.toMatch(/at .*\.js:\d+/);
    expect(html).not.toMatch(/\b10\.\d+\.\d+\.\d+\b/);
  });
});

test.describe('Datos sensibles', () => {
  test('la API no expone la tarjeta completa ni el hash de la contraseña', async ({ authedPage: page }) => {
    const body = await (await page.request.get('/api/account')).json();
    expect(body.card).not.toMatch(/^\d{13,19}$/);
    expect(body).not.toHaveProperty('passwordHash');
  });
});
