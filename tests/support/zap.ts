import { request, APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';

try {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
} catch {
  /* Node < 20.12: exporta las variables a mano */
}

/** Configuración central del taller (sobrescribible por variables de entorno). */
export const zapConfig = {
  enabled: process.env.ZAP_ENABLED !== 'false',
  proxy: process.env.ZAP_PROXY ?? `http://localhost:${process.env.ZAP_HOST_PORT ?? '8080'}`,
  apiKey: process.env.ZAP_API_KEY ?? 'taller-dast-key',
  /** URL de la app vista DESDE ZAP (red de Docker). */
  target: process.env.ZAP_TARGET ?? 'http://app:3000',
  /** Carpeta montada en el contenedor como /zap/wrk */
  reportsDir: process.env.ZAP_REPORTS_DIR ?? 'zap-reports',
  passiveScanTimeoutMs: Number(process.env.ZAP_PSCAN_TIMEOUT_MS ?? 120_000),
};

/** URL base que usará Playwright. Sin ZAP, pegamos directo al puerto publicado. */
export const baseURL = process.env.BASE_URL ?? (zapConfig.enabled ? zapConfig.target : 'http://localhost:3000');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ZapClient {
  private constructor(private readonly api: APIRequestContext) {}

  static async create(): Promise<ZapClient> {
    const api = await request.newContext({
      baseURL: zapConfig.proxy,
      timeout: 30_000,
      extraHTTPHeaders: { 'X-ZAP-API-Key': zapConfig.apiKey },
    });
    return new ZapClient(api);
  }

  async dispose() {
    await this.api.dispose();
  }

  private async get<T = any>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const res = await this.api.get(path, { params });
    if (!res.ok()) {
      throw new Error(`ZAP API ${path} respondió ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const type = res.headers()['content-type'] ?? '';
    return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
  }

  /** Espera a que ZAP termine de arrancar (tarda ~20-40 s la primera vez). */
  async waitUntilReady(timeoutMs = 120_000) {
    const start = Date.now();
    let lastError = '';
    while (Date.now() - start < timeoutMs) {
      try {
        const { version } = await this.get<{ version: string }>('/JSON/core/view/version/');
        return version;
      } catch (e) {
        lastError = (e as Error).message;
        await sleep(2_000);
      }
    }
    throw new Error(`ZAP no respondió en ${timeoutMs / 1000}s en ${zapConfig.proxy}. Último error: ${lastError}`);
  }

  /** Sesión limpia: borra historial y alertas de ejecuciones anteriores. */
  async newSession() {
    await this.get('/JSON/core/action/newSession/', { name: `run-${Date.now()}`, overwrite: true });
  }

  async recordsToScan(): Promise<number> {
    const { recordsToScan } = await this.get<{ recordsToScan: string }>('/JSON/pscan/view/recordsToScan/');
    return Number(recordsToScan);
  }

  /**
   * El escaneo pasivo es asíncrono: si pedimos las alertas en cuanto terminan los tests
   * podemos perder hallazgos. Esperamos a que la cola quede en 0.
   */
  async waitForPassiveScan(timeoutMs = zapConfig.passiveScanTimeoutMs) {
    const start = Date.now();
    let pending = await this.recordsToScan();
    while (pending > 0) {
      if (Date.now() - start > timeoutMs) {
        console.warn(`⚠️  Escaneo pasivo incompleto: quedan ${pending} registros tras ${timeoutMs / 1000}s`);
        return pending;
      }
      await sleep(1_000);
      pending = await this.recordsToScan();
    }
    return 0;
  }

  async alerts(baseurl = zapConfig.target) {
    const { alerts } = await this.get<{ alerts: ZapAlert[] }>('/JSON/core/view/alerts/', { baseurl });
    return alerts;
  }

  /** Genera reporte HTML dentro del contenedor (/zap/wrk → ./zap-reports). */
  async generateReport(template: string, fileName: string, title = 'Taller DAST - Escaneo pasivo') {
    return this.get('/JSON/reports/action/generate/', {
      title,
      template,
      sites: zapConfig.target,
      reportDir: '/zap/wrk',
      reportFileName: fileName,
    });
  }

  /** Reporte HTML "clásico" devuelto por la API (no depende del volumen). */
  async legacyHtmlReport(): Promise<string> {
    return this.get<string>('/OTHER/core/other/htmlreport/');
  }
}

export interface ZapAlert {
  pluginId: string;
  alertRef: string;
  alert: string;
  name: string;
  risk: 'High' | 'Medium' | 'Low' | 'Informational';
  confidence: string;
  url: string;
  method: string;
  param: string;
  evidence: string;
  cweid: string;
  wascid: string;
  description: string;
  solution: string;
  reference: string;
}
