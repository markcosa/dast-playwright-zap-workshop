#!/usr/bin/env node
/**
 * Reporte de remediación: para cada alerta de ZAP muestra
 *   1. el fragmento de código donde vive la falla (archivo y línea),
 *   2. cómo se corrige, con el fragmento del modo seguro.
 *
 *   node scripts/zap-report-code.mjs
 *
 * Entradas : zap-reports/zap-alerts.json  +  zap/remediation.json  +  el código fuente
 * Salida   : zap-reports/zap-remediacion.html
 *
 * Si el repo está en GitHub (GITHUB_REPOSITORY y GITHUB_SHA), cada fragmento
 * enlaza a la línea exacta del código.
 */
import fs from 'node:fs';
import path from 'node:path';

const alertsFile = process.env.ZAP_ALERTS_FILE ?? 'zap-reports/zap-alerts.json';
const mapFile = process.env.ZAP_REMEDIATION_FILE ?? 'zap/remediation.json';
const outFile = process.env.ZAP_CODE_REPORT ?? 'zap-reports/zap-remediacion.html';
const CONTEXT = Number(process.env.ZAP_SNIPPET_CONTEXT ?? 3);

const RISKS = ['High', 'Medium', 'Low', 'Informational'];
const COLORS = { High: '#B42B28', Medium: '#B36A00', Low: '#8A7400', Informational: '#2F5D8A' };

if (!fs.existsSync(alertsFile)) {
  console.error(`❌ No existe ${alertsFile}. Corre primero las pruebas con ZAP.`);
  process.exit(1);
}
const { alerts = [], target, generatedAt } = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
const rules = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')).rules ?? {} : {};

const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA ?? 'main';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Busca `marker` en el archivo y devuelve las líneas de alrededor. */
function snippet(file, marker, { before = CONTEXT, after = CONTEXT } = {}) {
  if (!file || !fs.existsSync(file)) return { error: `No se encontró el archivo ${file}` };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l.includes(marker));
  if (idx === -1) return { error: `No se encontró "${marker}" en ${file}` };
  const from = Math.max(0, idx - before);
  const to = Math.min(lines.length, idx + after + 1);
  return { file, line: idx + 1, from: from + 1, code: lines.slice(from, to), hit: idx - from };
}

function renderSnippet(s, highlightColor) {
  if (!s) return '';
  if (s.error) return `<p class="missing">${esc(s.error)}</p>`;
  const rows = s.code
    .map((l, i) => {
      const n = s.from + i;
      const cls = i === s.hit ? ` class="hit" style="border-left:4px solid ${highlightColor}"` : '';
      return `<tr${cls}><td class="ln">${n}</td><td><pre>${esc(l) || ' '}</pre></td></tr>`;
    })
    .join('');
  const link = repo
    ? `<a href="https://github.com/${repo}/blob/${sha}/${s.file}#L${s.line}" target="_blank" rel="noreferrer">${esc(s.file)}:${s.line}</a>`
    : `${esc(s.file)}:${s.line}`;
  return `<p class="path">${link}</p><table class="code">${rows}</table>`;
}

function renderLiteral(code) {
  const rows = code
    .split('\n')
    .map((l) => `<tr><td class="ln"></td><td><pre>${esc(l) || ' '}</pre></td></tr>`)
    .join('');
  return `<table class="code">${rows}</table>`;
}

// Agrupar instancias por tipo de alerta
const groups = new Map();
for (const a of alerts) {
  const key = `${a.pluginId}|${a.alert}`;
  if (!groups.has(key)) groups.set(key, { ...a, urls: new Set() });
  groups.get(key).urls.add(`${a.method} ${a.url}`);
}
const items = [...groups.values()].sort((x, y) => RISKS.indexOf(x.risk) - RISKS.indexOf(y.risk));
const mapped = items.filter((i) => rules[i.pluginId]);
const unmapped = items.filter((i) => !rules[i.pluginId]);

const cards = items
  .map((a) => {
    const rule = rules[a.pluginId];
    const color = COLORS[a.risk] ?? '#444';
    const urls = [...a.urls].slice(0, 6).map((u) => `<li>${esc(u)}</li>`).join('');
    const more = a.urls.size > 6 ? `<li>… y ${a.urls.size - 6} más</li>` : '';
    let body;
    if (!rule) {
      body = `<div class="col"><h3>Sin mapeo en zap/remediation.json</h3>
        <p>Agrega el pluginId <code>${esc(a.pluginId)}</code> al mapa para documentar dónde nace y cómo se corrige.</p>
        ${a.solution ? `<p class="zap"><b>Sugerencia de ZAP:</b> ${esc(a.solution.replace(/<[^>]+>/g, ' ')).slice(0, 300)}</p>` : ''}</div>`;
    } else {
      const vuln = renderSnippet(snippet(rule.file, rule.marker, { before: rule.before ?? CONTEXT, after: rule.after ?? CONTEXT }), color);
      const fix = rule.fixMarker
        ? renderSnippet(snippet(rule.fixFile ?? rule.file, rule.fixMarker, { before: rule.fixBefore ?? 0, after: rule.fixAfter ?? CONTEXT }), '#1E7449')
        : renderLiteral(rule.fixCode ?? '');
      body = `<div class="cols">
        <div class="col"><h3>Dónde nace <span class="tag">${esc(rule.vuln)}</span></h3>${vuln}</div>
        <div class="col"><h3>Cómo se corrige</h3><p>${esc(rule.fix)}</p>${fix}</div>
      </div>`;
    }
    return `<article class="card" style="border-top:6px solid ${color}">
      <header>
        <span class="risk" style="background:${color}">${esc(a.risk)}</span>
        <h2>${esc(a.alert)}</h2>
        <span class="plugin">plugin ${esc(a.pluginId)}${a.cweid && a.cweid !== '-1' ? ` · CWE-${esc(a.cweid)}` : ''} · ${a.urls.size} URL</span>
      </header>
      ${body}
      <details><summary>URLs afectadas</summary><ul>${urls}${more}</ul></details>
    </article>`;
  })
  .join('\n');

const counts = RISKS.map((r) => `<span class="pill" style="background:${COLORS[r]}">${r}: ${items.filter((i) => i.risk === r).length}</span>`).join('');

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remediación DAST · BancoPatito</title>
<style>
 :root { color-scheme: light }
 * { box-sizing: border-box }
 body { margin:0; background:#EEF1F6; color:#0F1720; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height:1.5 }
 header.top { background:#0F1720; color:#F3F1EA; padding:32px 40px }
 header.top h1 { margin:0 0 8px; font-size:28px }
 header.top p { margin:0; color:#A4AEB8; font-size:14px }
 .pill, .risk { display:inline-block; color:#fff; border-radius:999px; padding:3px 12px; font-size:13px; font-weight:700; margin-right:8px }
 main { max-width:1200px; margin:24px auto; padding:0 16px }
 .card { background:#fff; border:1px solid #DDE2EA; border-radius:12px; padding:24px; margin-bottom:20px }
 .card header { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px }
 .card h2 { font-size:20px; margin:0; flex:1 1 320px }
 .plugin { font-size:13px; color:#5B6475; font-family: ui-monospace, SFMono-Regular, Menlo, monospace }
 .cols { display:grid; grid-template-columns:1fr 1fr; gap:24px }
 @media (max-width:900px) { .cols { grid-template-columns:1fr } }
 .col h3 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:#5B6475; margin:0 0 8px }
 .tag { background:#F5C518; color:#0F1720; border-radius:4px; padding:1px 8px; font-size:12px; letter-spacing:0 }
 .path { font-size:13px; font-family: ui-monospace, Menlo, monospace; margin:0 0 6px }
 table.code { width:100%; border-collapse:collapse; background:#0F1720; border-radius:8px; overflow:hidden }
 table.code td { padding:2px 8px; vertical-align:top }
 table.code pre { margin:0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12.5px; color:#E4E7EB; white-space:pre-wrap; word-break:break-word }
 td.ln { width:48px; text-align:right; color:#6B7885; font-size:12px; font-family: ui-monospace, Menlo, monospace; user-select:none }
 tr.hit { background:#1D2A36 }
 .missing { color:#B42B28; font-size:14px; background:#FDECEA; padding:8px 12px; border-radius:6px }
 .zap { font-size:14px; color:#3B4652 }
 details { margin-top:16px; font-size:14px }
 summary { cursor:pointer; color:#5B6475 }
 footer { text-align:center; color:#5B6475; font-size:13px; padding:24px }
 a { color:#0F1720 }
</style></head>
<body>
<header class="top">
  <h1>Remediación DAST · dónde nace cada alerta y cómo se corrige</h1>
  <p>Objetivo ${esc(target ?? '')} · Escaneo ${esc(generatedAt ?? '')} · ${items.length} tipos de alerta, ${alerts.length} instancias · ${mapped.length} con mapeo, ${unmapped.length} sin mapear</p>
  <p style="margin-top:12px">${counts}</p>
</header>
<main>${cards}</main>
<footer>Generado por scripts/zap-report-code.mjs · los fragmentos se leen del código fuente en el momento de generar el reporte</footer>
</body></html>`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`📄 ${outFile}  (${items.length} tipos de alerta, ${mapped.length} con mapeo, ${unmapped.length} sin mapear)`);
if (unmapped.length) {
  console.log('   Sin mapeo:', unmapped.map((u) => `${u.pluginId} ${u.alert}`).join(', '));
}
