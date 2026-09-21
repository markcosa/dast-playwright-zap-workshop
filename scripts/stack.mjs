#!/usr/bin/env node
/**
 * Levanta / apaga el stack (app + ZAP) de forma multiplataforma (Windows, macOS, Linux).
 *   node scripts/stack.mjs up            → app vulnerable
 *   node scripts/stack.mjs up --secure   → app con correcciones (recrea contenedores)
 *   node scripts/stack.mjs down | logs | ps
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const [cmd = 'up', ...flags] = process.argv.slice(2);
const secure = flags.includes('--secure');

function compose(args, env = {}) {
  const r = spawnSync('docker', ['compose', ...args], { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.error) {
    console.error('❌ No se pudo ejecutar "docker". ¿Está instalado y abierto Docker Desktop?');
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

switch (cmd) {
  case 'up': {
    fs.mkdirSync('zap-reports', { recursive: true });
    try {
      fs.chmodSync('zap-reports', 0o777); // el contenedor de ZAP escribe como otro usuario (Linux)
    } catch {
      /* en Windows no aplica */
    }
    const args = ['up', '-d', '--build'];
    if (secure) args.push('--force-recreate');
    compose(args, { SECURE_MODE: secure ? 'true' : process.env.SECURE_MODE ?? 'false' });
    console.log(`\n✅ Stack arriba (SECURE_MODE=${secure ? 'true' : process.env.SECURE_MODE ?? 'false'})`);
    console.log('   App:  http://localhost:3000');
    console.log('   ZAP:  http://localhost:8090 (tarda ~30 s en estar listo)\n');
    break;
  }
  case 'down':
    compose(['down', '-v']);
    break;
  case 'logs':
    compose(['logs', '-f']);
    break;
  case 'ps':
    compose(['ps']);
    break;
  default:
    console.error(`Comando desconocido: ${cmd}. Usa up | up --secure | down | logs | ps`);
    process.exit(1);
}
