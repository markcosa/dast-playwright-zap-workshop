#!/usr/bin/env node
/**
 * Security gate: decide si el pipeline pasa o falla según las alertas de ZAP.
 *
 *  - Lee zap-reports/zap-alerts.json (generado en global-teardown)
 *  - Aplica zap/policy.json (riesgos que fallan + alertas aceptadas)
 *  - Escribe un resumen en $GITHUB_STEP_SUMMARY y anotaciones ::error / ::warning
 *  - Sale con código 1 si hay alertas que violan la política
 *
 *  Variables: ZAP_FAIL_ON=High,Medium  ZAP_ALERTS_FILE  ZAP_POLICY_FILE
 */
import fs from 'node:fs';

const alertsFile = process.env.ZAP_ALERTS_FILE ?? 'zap-reports/zap-alerts.json';
const policyFile = process.env.ZAP_POLICY_FILE ?? 'zap/policy.json';
const RISKS = ['High', 'Medium', 'Low', 'Informational'];
const ICON = { High: '🔴', Medium: '🟠', Low: '🟡', Informational: '🔵' };

if (!fs.existsSync(alertsFile)) {
  console.error(`❌ No existe ${alertsFile}. ¿Corrieron las pruebas con ZAP_ENABLED=true?`);
  process.exit(1);
}

const policy = fs.existsSync(policyFile) ? JSON.parse(fs.readFileSync(policyFile, 'utf8')) : {};
const failOn = (process.env.ZAP_FAIL_ON?.trim() ? process.env.ZAP_FAIL_ON.split(',') : policy.failOn ?? ['High'])
  .map((r) => r.trim())
  .filter(Boolean);
const ignored = new Map((policy.ignore ?? []).map((i) => [String(i.pluginId), i]));
const { alerts = [], target } = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));

// Agrupa instancias por tipo de alerta
const groups = new Map();
for (const a of alerts) {
  const key = `${a.pluginId}|${a.alert}`;
  if (!groups.has(key)) {
    groups.set(key, { pluginId: a.pluginId, name: a.alert, risk: a.risk, cwe: a.cweid, solution: a.solution, urls: new Set() });
  }
  groups.get(key).urls.add(`${a.method} ${a.url}`);
}

const rows = [...groups.values()].sort((a, b) => RISKS.indexOf(a.risk) - RISKS.indexOf(b.risk));
for (const r of rows) {
  r.accepted = ignored.get(String(r.pluginId));
  r.blocking = failOn.includes(r.risk) && !r.accepted;
}
const blocking = rows.filter((r) => r.blocking);
const counts = Object.fromEntries(RISKS.map((risk) => [risk, rows.filter((r) => r.risk === risk).length]));
const passed = blocking.length === 0;

// ---- Consola ---------------------------------------------------------------
console.log(`\n🛡️  ZAP Security Gate — objetivo: ${target}`);
console.log(`   Falla con: ${failOn.join(', ')}  |  Aceptadas en política: ${ignored.size}\n`);
for (const r of rows) {
  const tag = r.blocking ? 'BLOQUEA' : r.accepted ? 'ACEPTADA' : 'ok';
  console.log(`  ${ICON[r.risk] ?? '•'} [${tag.padEnd(8)}] ${r.risk.padEnd(13)} ${r.pluginId.padEnd(6)} ${r.name} (${r.urls.size} URL)`);
}
console.log(`\n${passed ? '✅ Gate aprobado' : `❌ Gate rechazado: ${blocking.length} tipo(s) de alerta bloqueante(s)`}\n`);

// ---- GitHub Actions ----------------------------------------------------------
if (process.env.GITHUB_ACTIONS) {
  for (const r of rows.filter((x) => x.blocking)) {
    const first = [...r.urls][0];
    console.log(`::error title=ZAP ${r.risk}: ${r.name}::Plugin ${r.pluginId} · CWE-${r.cwe} · ${r.urls.size} URL(s), p. ej. ${first}`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [];
  md.push(`## 🛡️ DAST pasivo con ZAP — ${passed ? '✅ Aprobado' : '❌ Rechazado'}`);
  md.push(`Objetivo: \`${target}\` · Falla con: **${failOn.join(', ')}** · Modo app: \`${process.env.SECURE_MODE ?? 'n/a'}\``);
  md.push('');
  md.push('| Riesgo | Tipos de alerta |');
  md.push('|---|---|');
  for (const risk of RISKS) md.push(`| ${ICON[risk]} ${risk} | ${counts[risk]} |`);
  md.push('');
  md.push('| Estado | Riesgo | Plugin | Alerta | URLs |');
  md.push('|---|---|---|---|---|');
  for (const r of rows) {
    const estado = r.blocking ? '❌ Bloquea' : r.accepted ? `☑️ Aceptada (${r.accepted.owner ?? 's/d'})` : '✔️';
    md.push(`| ${estado} | ${ICON[r.risk]} ${r.risk} | ${r.pluginId} | ${r.name} | ${r.urls.size} |`);
  }
  md.push('');
  md.push('Descarga el artefacto **zap-reports** para ver el reporte HTML completo.');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
}

process.exit(passed ? 0 : 1);
