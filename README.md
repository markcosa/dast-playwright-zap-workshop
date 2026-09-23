# 🦆 Taller DAST: Playwright + OWASP ZAP en GitHub Actions

Proyecto demo para enseñar **pruebas DAST pasivas** reutilizando pruebas funcionales de Playwright: todo el tráfico del navegador pasa por el proxy de ZAP, que analiza cada request/response y genera alertas. Un *security gate* decide si el pipeline pasa o falla.

> ⚠️ **BancoPatito es vulnerable a propósito.** Úsala sólo en tu máquina o en runners efímeros de CI. Nunca la publiques en internet.

```
┌──────────────┐  proxy HTTP   ┌───────────────┐   red docker   ┌──────────────────┐
│  Playwright  │ ────────────▶ │  ZAP (daemon) │ ─────────────▶ │  BancoPatito     │
│  (host / CI) │ ◀──────────── │  :8090        │ ◀───────────── │  app:3000        │
└──────┬───────┘               └───────┬───────┘                └──────────────────┘
       │ global-teardown               │ API REST
       ▼                               ▼
  zap-alerts.json ──▶ zap-gate.mjs ──▶ ✅ / ❌  +  resumen en GitHub + reportes HTML
```

## Contenido

| Ruta | Qué es |
|---|---|
| `app/` | BancoPatito (Express 5). `SECURE_MODE=false` vulnerable, `true` corregida. Busca `[VULN-xx]` en el código |
| `tests/e2e/` | Pruebas funcionales normales (login, búsqueda, transferencias, foro). Pasan en ambos modos |
| `tests/security/` | Aserciones de seguridad escritas con Playwright. Fallan en modo inseguro a propósito |
| `tests/support/zap.ts` | Cliente mínimo de la API de ZAP + configuración |
| `tests/support/global-setup.ts` | Espera a ZAP, crea sesión limpia y verifica la app a través del proxy |
| `tests/support/global-teardown.ts` | Espera a que termine el escaneo pasivo y guarda JSON, HTML y SARIF |
| `scripts/stack.mjs` | Levanta y apaga app + ZAP con Docker Compose (funciona igual en Windows, macOS y Linux) |
| `scripts/zap-gate.mjs` | Security gate: aplica `zap/policy.json`, escribe resumen y anotaciones en GitHub |
| `zap/policy.json` | Qué riesgos rompen el build y qué alertas se aceptan (con motivo y dueño) |
| `zap/rules.tsv` | Reglas equivalentes para las actions oficiales de ZAP |
| `.github/workflows/dast-pasivo.yml` | Pipeline principal: E2E + escaneo pasivo + gate (push, PR y manual) |
| `.github/workflows/dast-activo.yml` | Escaneo activo baseline/full con las actions oficiales (sólo manual) |
| `.vscode/` | Extensiones recomendadas, tareas y configuraciones de depuración |
| `docs/guia-taller.md` | Agenda y laboratorios paso a paso |
| `docs/mapa-vulnerabilidades.md` | Relación vulnerabilidad → alerta de ZAP → corrección |

## Requisitos

Node.js 20+ (recomendado 22), Docker con Docker Compose v2 y Git.

## Inicio rápido (local)

```bash
npm install
npx playwright install chromium

npm run stack:up          # app vulnerable + ZAP (ZAP tarda ~30 s en arrancar)
npm test                  # E2E a través de ZAP → genera zap-reports/
npm run zap:gate          # ❌ falla: hay alertas Medium

npm run stack:up:secure   # recrea la app con SECURE_MODE=true
npm test && npm run zap:gate   # ✅ debería pasar
npm run stack:down
```

Los resultados quedan en `zap-reports/`: `zap-report.html` (para personas), `zap-alerts.json` (para el gate) y `zap-report-sarif.json`. El reporte de Playwright se abre con `npm run report`. La app sin proxy se ve en http://localhost:3000.

Otros comandos útiles: `npm run test:security` corre las aserciones de seguridad, `npm run test:no-zap` corre las E2E sin ZAP contra `localhost:3000`, y `npm run dast` ejecuta pruebas y gate en un solo paso.

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `SECURE_MODE` | `false` | Modo de la app (lo lee docker compose) |
| `ZAP_ENABLED` | `true` | `false` desactiva proxy y reportes |
| `ZAP_PROXY` | `http://localhost:8090` | Proxy y API de ZAP |
| `ZAP_API_KEY` | `taller-dast-key` | API key de ZAP (en CI usa el secret `ZAP_API_KEY`) |
| `ZAP_TARGET` | `http://app:3000` | URL de la app vista desde ZAP; es la `baseURL` de Playwright |
| `ZAP_FAIL_ON` | *(policy.json)* | Sobrescribe los riesgos que rompen el gate, p. ej. `High` |
| `ZAP_PSCAN_TIMEOUT_MS` | `120000` | Máximo a esperar por la cola del escaneo pasivo |

Docker Compose lee `.env` automáticamente (ver `.env.example`); para Playwright exporta las variables en tu terminal.

## En GitHub Actions

1. Sube el proyecto a un repositorio nuevo.
2. Opcional: crea el secret `ZAP_API_KEY` en *Settings → Secrets and variables → Actions*.
3. Cada push a `main` o PR ejecuta **DAST pasivo · Playwright + ZAP**. Con la app vulnerable el job termina en rojo y el resumen muestra qué alertas bloquean.
4. En *Actions → DAST pasivo → Run workflow* elige `secure_mode: true` para verlo en verde, o cambia `fail_on` para jugar con la política.
5. Descarga los artefactos `zap-reports` y `playwright-report`.
6. **DAST activo · ZAP (manual)** corre `baseline` o `full` con las actions oficiales. El escaneo *full* sí ataca la app y encuentra los XSS reales.

## Por qué hay un truco con `http://app:3000`

Si Playwright navegara a `http://localhost:3000` a través del proxy, ZAP intentaría conectarse a su propio `localhost` dentro del contenedor, donde no está la app. Al usar el nombre del servicio de Compose, el navegador entrega la petición al proxy y **ZAP resuelve `app` dentro de la red de Docker**. Así la misma configuración funciona en Mac, Windows, Linux y en los runners de GitHub, sin `host.docker.internal` ni `--network host`.

## Qué mejora respecto al artículo de referencia

El proyecto parte de la idea de *Turning Functional Tests into Security Guards* (thanan, Medium) y agrega lo necesario para un pipeline real:

- **Espera activa del escaneo pasivo** (`pscan/view/recordsToScan`) antes de pedir alertas; sin esto se pierden hallazgos de forma intermitente.
- **API key habilitada** en lugar de `api.disablekey=true`.
- **Reportes por volumen** en vez de `docker cp`, con fallback al reporte HTML clásico por API.
- **Security gate** con política versionada, alertas aceptadas con dueño, anotaciones y resumen en GitHub.
- **Una app que se puede romper y arreglar**, para que el pipeline pase de rojo a verde durante el taller.

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `ZAP no respondió en 120s` | ZAP sigue arrancando o el puerto 8090 está ocupado. Revisa `npm run stack:logs` |
| `ZAP API ... respondió 403` | API key distinta entre compose y Playwright. Usa la misma `ZAP_API_KEY` |
| Pruebas con `net::ERR_NAME_NOT_RESOLVED` para `app` | Corriste con `ZAP_ENABLED=false`; usa `npm run test:no-zap` |
| No aparece `zap-report.html` | Permisos del volumen en Linux: `chmod 777 zap-reports` (lo hace `npm run stack:up`) |
| El gate dice que no existe `zap-alerts.json` | El teardown no corrió o falló; revisa la salida al final de `npm test` |
| Cambié `SECURE_MODE` y no se nota | Recrea el contenedor: `npm run stack:up:secure` usa `--force-recreate` |
