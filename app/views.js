/**
 * Vistas HTML renderizadas con template strings (sin motor de plantillas para que
 * el flujo de datos sea evidente durante el taller).
 */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// En modo inseguro algunos valores se imprimen "crudos" a propósito
const out = (ctx, v) => (ctx.secure ? esc(v) : String(v ?? ''));
const money = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const csrfField = (ctx) => (ctx.secure && ctx.csrf ? `<input type="hidden" name="csrf_token" value="${esc(ctx.csrf)}">` : '');

function layout(ctx, title, body) {
  const nav = ctx.user
    ? `<a href="/dashboard">Mi cuenta</a>
       <a href="/transfer">Transferir</a>
       <a href="/comments">Foro</a>
       <form method="post" action="/logout" class="inline">${csrfField(ctx)}
         <button type="submit" class="link" data-testid="logout">Cerrar sesión</button>
       </form>`
    : `<a href="/comments">Foro</a><a href="/login" class="btn-small">Iniciar sesión</a>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · BancoPatito</title>
  <link rel="stylesheet" href="/static/styles.css">
  <script src="/static/app.js" defer></script>
</head>
<body>
  <header class="topbar">
    <a href="/" class="brand"><span class="duck" aria-hidden="true"></span>BancoPatito</a>
    <nav>${nav}</nav>
  </header>
  <p class="mode ${ctx.secure ? 'mode-secure' : 'mode-insecure'}" data-testid="mode">
    ${ctx.secure ? 'Modo seguro: correcciones activas' : 'Modo inseguro: app vulnerable para el taller'}
  </p>
  <main>${body}</main>
  <footer>
    <p>BancoPatito es una aplicación de demostración. No uses datos reales.</p>
    ${/* [VULN-09] IP privada en el pie de página */ ''}
    ${ctx.secure ? '' : '<p class="muted">Atendido por app-node-02 (10.0.3.17)</p>'}
  </footer>
</body>
</html>`;
}

exports.home = (ctx) =>
  layout(
    ctx,
    'Inicio',
    `
  ${/* [VULN-08] Comentario HTML con información sensible */ ''}
  ${ctx.secure ? '' : '<!-- TODO: quitar usuario admin / password admin123 antes de salir a producción -->'}
  <section class="hero">
    <h1>Tu dinero, sin cuentos chinos.</h1>
    <p>Consulta tu saldo, transfiere a otras cuentas y platica con otros clientes en el foro.</p>
    <a href="${ctx.user ? '/dashboard' : '/login'}" class="btn" data-testid="cta">${ctx.user ? 'Ir a mi cuenta' : 'Iniciar sesión'}</a>
  </section>`,
  );

exports.login = (ctx, { error, username = '', csrf }) =>
  layout(
    ctx,
    'Iniciar sesión',
    `
  <section class="panel narrow">
    <h1>Iniciar sesión</h1>
    ${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/login" autocomplete="off">
      ${csrf ? `<input type="hidden" name="csrf_token" value="${esc(csrf)}">` : ''}
      <label for="username">Usuario</label>
      <input id="username" name="username" value="${esc(username)}" required>
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" required>
      <button type="submit" class="btn">Entrar</button>
    </form>
    <p class="muted">Usuarios de prueba: <code>ana / Patito123!</code> y <code>luis / Quack2026!</code></p>
  </section>`,
  );

exports.dashboard = (ctx, { movements }) =>
  layout(
    ctx,
    'Mi cuenta',
    `
  <section class="panel">
    <p class="muted">Hola, ${esc(ctx.user.name)} · Cuenta ${esc(ctx.user.account)}</p>
    <p class="balance" data-testid="balance">${money(ctx.user.balance)}</p>
    <p class="muted">Saldo disponible</p>
  </section>
  <section class="panel">
    <h2>Buscar movimientos</h2>
    <form method="get" action="/search" class="row">
      <label for="q" class="sr-only">Concepto</label>
      <input id="q" name="q" placeholder="Ej. supermercado">
      <button type="submit" class="btn">Buscar</button>
    </form>
    ${movementsTable(movements)}
    <p><a href="/reports/monthly" data-testid="monthly-report">Descargar reporte mensual</a></p>
  </section>`,
  );

function movementsTable(rows) {
  if (!rows.length) return '<p class="muted" data-testid="empty">No hay movimientos con ese concepto. Prueba con otra palabra.</p>';
  return `<table data-testid="movements">
    <thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Monto</th></tr></thead>
    <tbody>${rows
      .map(
        (m) =>
          `<tr><td>${esc(m.date)}</td><td>${esc(m.concept)}</td><td class="num ${m.amount < 0 ? 'neg' : 'pos'}">${money(m.amount)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
}

exports.search = (ctx, { q, results }) =>
  layout(
    ctx,
    'Buscar',
    `
  <section class="panel">
    ${/* [VULN-10] XSS reflejado: en modo inseguro "q" se imprime sin escapar */ ''}
    <h1 data-testid="search-title">Resultados para: ${out(ctx, q)}</h1>
    <form method="get" action="/search" class="row">
      <label for="q" class="sr-only">Concepto</label>
      <input id="q" name="q" value="${out(ctx, q)}">
      <button type="submit" class="btn">Buscar</button>
    </form>
    ${movementsTable(results)}
    <p><a href="/dashboard">Volver a mi cuenta</a></p>
  </section>`,
  );

exports.transfer = (ctx, { error, ok }) =>
  layout(
    ctx,
    'Transferir',
    `
  <section class="panel narrow">
    <h1>Transferir</h1>
    <p class="muted">Saldo disponible: <strong data-testid="transfer-balance">${money(ctx.user.balance)}</strong></p>
    ${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ''}
    ${ok ? `<p class="alert ok" role="status">${esc(ok)}</p>` : ''}
    <form method="post" action="/transfer">
      ${csrfField(ctx)}
      <label for="to">Usuario destino</label>
      <input id="to" name="to" required>
      <label for="amount">Monto (MXN)</label>
      <input id="amount" name="amount" type="number" min="1" step="0.01" required>
      <button type="submit" class="btn">Transferir</button>
    </form>
  </section>`,
  );

exports.comments = (ctx, { comments }) =>
  layout(
    ctx,
    'Foro',
    `
  <section class="panel">
    <h1>Foro de clientes</h1>
    <ul class="comments" data-testid="comments">
      ${/* [VULN-11] XSS almacenado: el texto del comentario va sin escapar */ ''}
      ${comments.map((c) => `<li><strong>${esc(c.author)}</strong><p>${out(ctx, c.text)}</p></li>`).join('')}
    </ul>
    ${
      ctx.user
        ? `<form method="post" action="/comments">
            ${csrfField(ctx)}
            <label for="text">Escribe un comentario</label>
            <textarea id="text" name="text" rows="3" maxlength="500" required></textarea>
            <button type="submit" class="btn">Publicar comentario</button>
          </form>`
        : '<p class="muted"><a href="/login">Inicia sesión</a> para publicar un comentario.</p>'
    }
  </section>`,
  );

exports.errorPage = (ctx, message) =>
  layout(ctx, 'Aviso', `<section class="panel narrow"><h1>Algo no salió bien</h1><p>${esc(message)}</p><p><a href="/">Volver al inicio</a></p></section>`);

exports.stackTrace = (ctx, err) =>
  layout(
    ctx,
    'Error',
    `<section class="panel"><h1>Internal Server Error</h1>
     <pre class="trace">${esc(err.stack)}\n\nnode ${process.version} · express · pid ${process.pid}</pre></section>`,
  );
