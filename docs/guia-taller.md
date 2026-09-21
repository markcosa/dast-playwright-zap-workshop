# Guía del taller: DAST pasivo con Playwright + ZAP

Duración sugerida: 3 horas. Público: QA, desarrolladores y DevSecOps con nociones de Playwright y Git.

**Objetivo:** que cada participante convierta sus pruebas funcionales en un escaneo de seguridad automático y lo integre como *gate* en GitHub Actions.

## Preparación (antes del taller)

Pide a los participantes que tengan instalados Node 22, Docker Desktop y Git, y que ejecuten una vez:

```bash
git clone <tu-repo> && cd dast-workshop
npm install && npx playwright install chromium
docker pull zaproxy/zap-stable     # ~1.5 GB, mejor no descargarla en vivo
```

Cada participante debe hacer *fork* del repositorio para poder correr Actions.

## Agenda

| Bloque | Tema | Tiempo |
|---|---|---|
| 1 | SAST vs SCA vs DAST, pasivo vs activo, dónde encaja en el pipeline | 15 min |
| 2 | Lab 1: levantar el stack y recorrer BancoPatito | 20 min |
| 3 | Lab 2: pruebas funcionales como escáner | 20 min |
| 4 | Lab 3: leer el reporte y encontrar la falla en el código | 25 min |
| 5 | Lab 4: el pipeline en rojo | 20 min |
| 6 | Lab 5: corregir y ver el pipeline en verde | 25 min |
| 7 | Lab 6: triage y política de excepciones | 15 min |
| 8 | Lab 7: aserciones de seguridad y escaneo activo | 20 min |
| 9 | Cierre y preguntas | 10 min |

## Lab 1: levantar el stack

```bash
npm run stack:up
docker compose ps
```

Abre http://localhost:3000, inicia sesión con `ana / Patito123!` y recorre las pantallas. Observa la banda roja "Modo inseguro". Abre las DevTools y revisa las cabeceras de respuesta y la cookie `sessionid`.

**Pregunta:** ¿qué información le da la página a un atacante sin hacer nada malicioso?

## Lab 2: pruebas funcionales como escáner

Revisa `playwright.config.ts` (bloque `proxy`) y los archivos de `tests/support/`. Después:

```bash
npm test
```

Observa en la consola: sesión nueva de ZAP, pruebas, espera del escaneo pasivo y el resumen de alertas.

**Discusión:** ¿por qué esperamos a `recordsToScan = 0`? Prueba comentar `waitForPassiveScan()` y corre dos veces: el número de alertas puede variar.

## Lab 3: del reporte al código

Abre `zap-reports/zap-report.html`. Elige tres alertas de distinto riesgo y, para cada una, encuentra el `[VULN-xx]` responsable en `app/` usando la evidencia y la URL del reporte. Compara con `docs/mapa-vulnerabilidades.md` al terminar.

**Reto:** agrega una prueba E2E que visite una página no cubierta (por ejemplo el 404) y verifica si aparecen alertas nuevas. La cobertura DAST pasiva es tan buena como la cobertura de tus pruebas.

## Lab 4: el pipeline en rojo

Haz push a tu fork. En la pestaña **Actions** abre la ejecución de *DAST pasivo*:

- El paso **Security gate** falla y muestra anotaciones `ZAP Medium: ...`.
- El **Summary** del job tiene la tabla de alertas.
- Descarga el artefacto `zap-reports`.

```bash
npm run zap:gate                       # igual que en CI
ZAP_FAIL_ON=High npm run zap:gate      # ¿qué pasa si sólo bloqueamos High?
```

## Lab 5: corregir

Por equipos, cada uno corrige una falla directamente en el modo inseguro de `app/server.js` o `app/views.js` (por ejemplo, agregar la CSP o los flags de la cookie). Luego:

```bash
docker compose up -d --build app && npm run dast
```

Al final, ejecuta el workflow manual con `secure_mode: true` y confirma que el gate pasa. Compara ambos resúmenes.

## Lab 6: triage y excepciones

No toda alerta se corrige. Abre `zap/policy.json` y discute:

- ¿Quién puede aceptar un riesgo y con qué evidencia?
- ¿Por qué cada excepción lleva `reason` y `owner`?
- ¿Qué pasa si alguien agrega `10038` (CSP) a `ignore`? Revisa cómo se ve eso en un Pull Request.

## Lab 7: más allá del pasivo

```bash
npm run test:security   # falla en modo inseguro, pasa en modo seguro
```

Las aserciones de `tests/security/` son deterministas y rápidas, pero sólo validan lo que ya sabes buscar. ZAP encuentra lo que no esperabas. Se complementan.

Para cerrar, ejecuta el workflow **DAST activo** con `scan: full` y modo inseguro. Compara las alertas High (XSS reflejado 40012) con las del pasivo y discute por qué el activo no va en cada push.

## Mensajes clave para el cierre

1. DAST pasivo cuesta casi cero si ya tienes pruebas E2E: sólo agregas un proxy.
2. Esperar el fin del escaneo pasivo y versionar la política es lo que lo vuelve confiable en CI.
3. El pasivo detecta configuración e indicios; el activo confirma explotabilidad en entornos aislados.
4. Un gate sin proceso de excepciones termina desactivado; uno con dueños y motivos sobrevive.
