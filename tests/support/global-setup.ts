import { request } from '@playwright/test';
import { ZapClient, zapConfig, baseURL } from './zap';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a que la app responda (a través de ZAP si está habilitado). */
async function waitForApp(timeoutMs = 90_000) {
  const ctx = await request.newContext({
    baseURL,
    proxy: zapConfig.enabled ? { server: zapConfig.proxy } : undefined,
    timeout: 10_000,
  });
  const start = Date.now();
  try {
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await ctx.get('/');
        if (res.ok()) return;
      } catch {
        /* reintentar */
      }
      await sleep(2_000);
    }
    throw new Error(`La app no respondió en ${baseURL} tras ${timeoutMs / 1000}s`);
  } finally {
    await ctx.dispose();
  }
}

export default async function globalSetup() {
  if (!zapConfig.enabled) {
    console.log('\nℹ️  ZAP_ENABLED=false → pruebas funcionales sin escaneo DAST\n');
    await waitForApp();
    return;
  }

  console.log(`\n🦆 Preparando ZAP en ${zapConfig.proxy} ...`);
  const zap = await ZapClient.create();
  try {
    const version = await zap.waitUntilReady();
    console.log(`✅ ZAP ${version} listo`);
    await zap.newSession();
    console.log('🧹 Nueva sesión de ZAP (historial y alertas limpias)');
  } finally {
    await zap.dispose();
  }

  await waitForApp();
  console.log(`✅ App disponible en ${baseURL} a través del proxy\n`);
}
