import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZapClient, zapConfig } from './zap';

const RISK_ORDER = ['High', 'Medium', 'Low', 'Informational'] as const;

export default async function globalTeardown() {
  if (!zapConfig.enabled) return;

  console.log('\n🎬 Recolectando resultados de ZAP ...');
  fs.mkdirSync(zapConfig.reportsDir, { recursive: true });
  const zap = await ZapClient.create();

  try {
    const pending = await zap.waitForPassiveScan();
    if (pending === 0) console.log('✅ Escaneo pasivo completado');

    // 1) Alertas en JSON → las consume el security gate (scripts/zap-gate.mjs)
    const alerts = await zap.alerts();
    const jsonPath = path.join(zapConfig.reportsDir, 'zap-alerts.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ target: zapConfig.target, generatedAt: new Date().toISOString(), alerts }, null, 2),
    );
    console.log(`📄 ${jsonPath}`);

    // 2) Reportes HTML para humanos
    for (const [template, file] of [
      ['traditional-html-plus', 'zap-report'],
      ['sarif-json', 'zap-report-sarif'],
    ]) {
      try {
        await zap.generateReport(template, file);
        console.log(`📄 ${zapConfig.reportsDir}/${file}.* (${template})`);
      } catch (e) {
        console.warn(`⚠️  No se pudo generar ${template}: ${(e as Error).message}`);
        if (template === 'traditional-html-plus') {
          fs.writeFileSync(path.join(zapConfig.reportsDir, 'zap-report-legacy.html'), await zap.legacyHtmlReport());
          console.log(`📄 ${zapConfig.reportsDir}/zap-report-legacy.html (fallback)`);
        }
      }
    }

    // 3) Resumen en consola
    const unique = new Map<string, { risk: string; name: string; count: number }>();
    for (const a of alerts) {
      const key = `${a.pluginId}-${a.alert}`;
      const item = unique.get(key) ?? { risk: a.risk, name: a.alert, count: 0 };
      item.count++;
      unique.set(key, item);
    }
    console.log(`\n📈 Resumen ZAP para ${zapConfig.target}: ${unique.size} tipos de alerta, ${alerts.length} instancias`);
    for (const risk of RISK_ORDER) {
      const rows = [...unique.values()].filter((u) => u.risk === risk);
      if (!rows.length) continue;
      console.log(`   ${risk}:`);
      rows.forEach((r) => console.log(`     • ${r.name} (${r.count})`));
    }
    console.log('');
  } finally {
    await zap.dispose();
  }
}
