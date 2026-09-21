import { defineConfig, devices } from '@playwright/test';
import { baseURL, zapConfig } from './tests/support/zap';

// Local: usa el Chrome del sistema (macOS 13 ya no recibe builds de Chromium).
// En CI: el Chromium empaquetado de Playwright.
const chromeChannel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {};
export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // La app guarda estado en memoria (saldos) y ZAP procesa el tráfico en orden:
  // un solo worker hace el taller más predecible.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ...(process.env.CI ? ([['github']] as const) : []),
  ],

  globalSetup: require.resolve('./tests/support/global-setup'),
  globalTeardown: require.resolve('./tests/support/global-teardown'),

  use: {
    baseURL,
    // 👇 La magia del taller: todo el tráfico del navegador pasa por ZAP
    proxy: zapConfig.enabled ? { server: zapConfig.proxy } : undefined,
    // ZAP intercepta TLS con su propia CA
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        // Chrome asciende http:// a https:// por su cuenta; contra la app HTTP del
        // taller eso rompe el handshake dentro de ZAP.
        '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeV2,HttpsFirstModeIncognito',
        '--disable-https-first-mode-for-engagement-heuristic',
        '--proxy-bypass-list=<-loopback>',
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-MX',
  },

  projects: [
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'], ...chromeChannel },
    },
    {
      // Aserciones de seguridad escritas a mano: fallan en modo inseguro a propósito
      name: 'security',
      testDir: './tests/security',
      use: { ...devices['Desktop Chrome'], ...chromeChannel },
    },
  ],
});
