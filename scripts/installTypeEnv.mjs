// Instala server/typeenv (librerías de la plantilla para la revisión de tipos).
// Lo corre el `postinstall` de la raíz.
//
// Por qué un script y no `npm --prefix server/typeenv ci` directo: dentro de un
// script de npm, el npm anidado HEREDA variables npm_config_* / npm_package_*
// que apuntan a la raíz (p. ej. npm_config_local_prefix) y termina instalando
// el proyecto raíz dentro de server/typeenv. Aquí se lanzan limpias.
//
// Fail-open: si la instalación falla, avisa y sale con 0 — la revisión de tipos
// queda desactivada (server/typecheck.js responde available:false), pero el
// deploy no se cae por esto.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPEENV = path.join(ROOT, 'server', 'typeenv');

const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^npm_(config|package|lifecycle)_/i.test(k) && k !== 'INIT_CWD')
);

const result = spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], {
  cwd: TYPEENV,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.warn('[typeenv] no se pudo instalar: la revisión de tipos quedará desactivada.');
}
process.exit(0);
