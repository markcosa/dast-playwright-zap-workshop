# Mapa de vulnerabilidades de BancoPatito

Cada falla está marcada en `app/server.js` o `app/views.js` con su identificador. La columna "Detección" indica si ZAP la encuentra con escaneo **pasivo** (pipeline de cada push) o si hace falta el **activo** (workflow manual). Los nombres, IDs y niveles de riesgo pueden variar ligeramente entre versiones de ZAP; úsalos como guía para el ejercicio de triage.

| ID | Falla | Dónde | Alerta esperada en ZAP (pluginId) | Riesgo | Detección | Corrección en SECURE_MODE |
|---|---|---|---|---|---|---|
| VULN-01 | Cabecera `Server` con versión | `server.js` middleware | Server Leaks Version Information via "Server" HTTP Response Header Field (10036) | Low | Pasiva | No se envía la cabecera |
| VULN-02 | `X-Powered-By: Express` | `server.js` | Server Leaks Information via "X-Powered-By" (10037) | Low | Pasiva | `app.disable('x-powered-by')` |
| VULN-03 | Sin cabeceras de seguridad | `server.js` | CSP Header Not Set (10038), Missing Anti-clickjacking Header (10020), X-Content-Type-Options Header Missing (10021), Permissions Policy Header Not Set (10063), Insufficient Site Isolation Against Spectre (90004), Re-examine Cache-control Directives (10015) | Medium / Low / Info | Pasiva | CSP estricta, `X-Frame-Options`, `nosniff`, `Permissions-Policy`, COOP/COEP/CORP, `Cache-Control: no-store` |
| VULN-04 | Cookie de sesión sin flags | `createSession()` | Cookie No HttpOnly Flag (10010), Cookie without SameSite Attribute (10054) | Low | Pasiva | `HttpOnly; SameSite=Strict` (+ `Secure` con `COOKIE_SECURE=true` en HTTPS) |
| VULN-05 | Formularios sin token anti-CSRF | `checkCsrf()` y vistas | Absence of Anti-CSRF Tokens (10202) | Medium | Pasiva | Campo `csrf_token` por sesión y *double submit cookie* en login |
| VULN-06 | CORS abierto en la API | `/api/account` | Cross-Domain Misconfiguration (10098) | Medium | Pasiva | Sin `Access-Control-Allow-Origin: *` |
| VULN-07 | Stack trace en errores 500 | manejador de errores | Application Error Disclosure (90022), Information Disclosure - Debug Error Messages (10023) | Low / Medium | Pasiva | Mensaje genérico; el detalle sólo va al log |
| VULN-08 | Comentario HTML con credenciales | `views.home` | Information Disclosure - Suspicious Comments (10027) | Informational | Pasiva | Comentario eliminado |
| VULN-09 | IP privada en el pie de página y en el error | `views.layout`, error de `/reports/monthly` | Private IP Disclosure (2) | Low | Pasiva | No se imprime |
| VULN-10 | XSS reflejado en búsqueda | `views.search` | Pasiva: User Controllable HTML Element Attribute (10031). Activa: Cross Site Scripting (Reflected) (40012) | Info / High | Pasiva (indicio) y activa (confirmación) | Escapar con `esc()` |
| VULN-11 | XSS almacenado en el foro | `views.comments` | Cross Site Scripting (Persistent) (40014) | High | Activa, requiere sesión autenticada | Escapar con `esc()` |

## Ideas para discutir

- El escaneo pasivo **nunca confirma** un XSS; sólo da indicios. Por eso el workflow activo existe y por eso `tests/security/` valida XSS con un payload real.
- VULN-11 requiere que el escáner activo inicie sesión. Es un buen ejercicio para configurar autenticación en ZAP (contexto + usuario) o para mostrar el valor de que Playwright ya maneje el login.
- Agregar `Secure` a la cookie sólo tiene sentido con HTTPS; en HTTP ZAP no lo reporta.
