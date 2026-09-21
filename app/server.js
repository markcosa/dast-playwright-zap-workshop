/**
 * BancoPatito — aplicación DEMO intencionalmente vulnerable para talleres DAST.
 *
 *  ⚠️  NO desplegar en internet. Sólo para laboratorio / CI efímero.
 *
 *  SECURE_MODE=false (default) → la app expone fallas que ZAP detecta en modo pasivo
 *  SECURE_MODE=true            → las mismas pantallas, pero con las correcciones aplicadas
 *
 *  Cada falla está marcada con  [VULN-xx]  para que los participantes la encuentren
 *  y la relacionen con la alerta de ZAP (ver docs/mapa-vulnerabilidades.md).
 */
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const views = require('./views');

const PORT = Number(process.env.PORT || 3000);
const SECURE = String(process.env.SECURE_MODE || 'false').toLowerCase() === 'true';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';

const app = express();

// ---------------------------------------------------------------------------
// "Base de datos" en memoria
// ---------------------------------------------------------------------------
const users = {
  ana: { password: 'Patito123!', name: 'Ana López', balance: 25_000, account: '0012-3456-7890' },
  luis: { password: 'Quack2026!', name: 'Luis Pérez', balance: 8_500, account: '0098-7654-3210' },
};
const movements = {
  ana: [
    { date: '2026-09-01', concept: 'Nómina septiembre', amount: 18_000 },
    { date: '2026-09-03', concept: 'Supermercado', amount: -1_240 },
    { date: '2026-09-05', concept: 'Pago tarjeta de crédito', amount: -4_500 },
    { date: '2026-09-09', concept: 'Gasolina', amount: -950 },
  ],
  luis: [{ date: '2026-09-02', concept: 'Honorarios', amount: 9_000 }],
};
const comments = [{ author: 'Soporte', text: 'Bienvenido al foro de clientes de BancoPatito.' }];
const sessions = new Map(); // sid -> { user, csrf }

// ---------------------------------------------------------------------------
// Middlewares de seguridad (sólo en SECURE_MODE)
// ---------------------------------------------------------------------------
if (SECURE) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    });
    next();
  });
} else {
  app.use((req, res, next) => {
    res.set('Server', 'Apache/2.4.29 (Ubuntu)'); // [VULN-01] Fuga de versión del servidor
    next(); //                                      [VULN-02] X-Powered-By: Express queda activo
    //                                              [VULN-03] Sin CSP, X-Frame-Options, nosniff...
  });
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------
function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

function createSession(res, user) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { user, csrf: crypto.randomBytes(24).toString('hex') });
  if (SECURE) {
    res.cookie('sessionid', sid, { httpOnly: true, sameSite: 'strict', secure: COOKIE_SECURE, path: '/' });
  } else {
    // [VULN-04] Cookie de sesión sin HttpOnly ni SameSite
    res.setHeader('Set-Cookie', `sessionid=${sid}; Path=/`);
  }
}

app.use((req, res, next) => {
  const sid = parseCookies(req.headers.cookie).sessionid;
  const session = sid && sessions.get(sid);
  req.sid = session ? sid : null;
  req.session = session || null;
  req.user = session ? { username: session.user, ...users[session.user] } : null;
  res.locals.ctx = { secure: SECURE, user: req.user, csrf: session?.csrf };
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

function checkCsrf(req, res, next) {
  if (!SECURE) return next(); // [VULN-05] Formularios sin token anti-CSRF
  const expected = req.session?.csrf;
  if (!expected || req.body.csrf_token !== expected) {
    return res.status(403).send(views.errorPage(res.locals.ctx, 'Token CSRF inválido. Recarga la página e inténtalo de nuevo.'));
  }
  next();
}

// Token anti-CSRF para el login (double submit cookie) en modo seguro
function loginCsrf(req, res) {
  if (!SECURE) return undefined;
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie('login_csrf', token, { httpOnly: true, sameSite: 'strict', secure: COOKIE_SECURE, path: '/login' });
  return token;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------
app.get('/', (req, res) => res.send(views.home(res.locals.ctx)));

app.get('/login', (req, res) => {
  res.send(views.login(res.locals.ctx, { csrf: loginCsrf(req, res) }));
});

app.post('/login', (req, res) => {
  if (SECURE) {
    const cookieToken = parseCookies(req.headers.cookie).login_csrf;
    if (!cookieToken || cookieToken !== req.body.csrf_token) {
      return res.status(403).send(views.errorPage(res.locals.ctx, 'Token CSRF inválido. Recarga la página e inténtalo de nuevo.'));
    }
  }
  const { username = '', password = '' } = req.body;
  const user = users[username];
  if (!user || user.password !== password) {
    return res
      .status(401)
      .send(views.login(res.locals.ctx, { error: 'Usuario o contraseña incorrectos.', username, csrf: loginCsrf(req, res) }));
  }
  if (req.sid) sessions.delete(req.sid);
  createSession(res, username);
  res.redirect('/dashboard');
});

app.post('/logout', requireAuth, checkCsrf, (req, res) => {
  sessions.delete(req.sid);
  res.clearCookie('sessionid', { path: '/' });
  res.redirect('/login');
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.send(views.dashboard(res.locals.ctx, { movements: movements[req.user.username] }));
});

app.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '');
  const results = movements[req.user.username].filter((m) => m.concept.toLowerCase().includes(q.toLowerCase()));
  res.send(views.search(res.locals.ctx, { q, results }));
});

app.get('/transfer', requireAuth, (req, res) => res.send(views.transfer(res.locals.ctx, {})));

app.post('/transfer', requireAuth, checkCsrf, (req, res) => {
  const amount = Number(req.body.amount);
  const to = String(req.body.to || '');
  const from = req.user.username;
  if (!users[to] || to === from) {
    return res.status(400).send(views.transfer(res.locals.ctx, { error: 'La cuenta destino no existe.' }));
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > users[from].balance) {
    return res.status(400).send(views.transfer(res.locals.ctx, { error: 'Ingresa un monto válido y menor a tu saldo.' }));
  }
  users[from].balance -= amount;
  users[to].balance += amount;
  const date = new Date().toISOString().slice(0, 10);
  movements[from].push({ date, concept: `Transferencia a ${to}`, amount: -amount });
  movements[to].push({ date, concept: `Transferencia de ${from}`, amount });
  res.send(views.transfer({ ...res.locals.ctx, user: { ...req.user, balance: users[from].balance } }, { ok: `Transferiste $${amount.toLocaleString('es-MX')} a ${to}.` }));
});

app.get('/comments', (req, res) => res.send(views.comments(res.locals.ctx, { comments })));

app.post('/comments', requireAuth, checkCsrf, (req, res) => {
  const text = String(req.body.text || '').slice(0, 500);
  if (text.trim()) comments.push({ author: req.user.name, text });
  res.redirect('/comments');
});

// API JSON
app.get('/api/account', requireAuth, (req, res) => {
  if (!SECURE) res.set('Access-Control-Allow-Origin', '*'); // [VULN-06] CORS abierto a cualquier origen
  const { name, account, balance } = req.user;
  res.json({ name, account, balance });
});

// Endpoint que falla a propósito
app.get('/reports/monthly', requireAuth, () => {
  throw new Error('ECONNREFUSED 10.0.3.17:5432 — no se pudo conectar a reports_db');
});

// Manejo de errores
app.use((err, req, res, _next) => {
  console.error(err);
  if (SECURE) {
    return res.status(500).send(views.errorPage(res.locals.ctx, 'No pudimos generar el reporte. Intenta más tarde.'));
  }
  // [VULN-07] Stack trace e IP privada expuestos al usuario
  res.status(500).send(views.stackTrace(res.locals.ctx, err));
});

app.use((req, res) => res.status(404).send(views.errorPage(res.locals.ctx, 'Esta página no existe.')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦆 BancoPatito escuchando en http://0.0.0.0:${PORT}  (SECURE_MODE=${SECURE})`);
});
