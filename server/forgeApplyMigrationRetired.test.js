import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// EL DISPARADOR TEMPORAL DE CIRUGÍA 1 ESTÁ RETIRADO.
//
// `window.__forgeApplyMigration` existió por una razón acotada: ejercitar el
// runner de migraciones ANTES de que hubiera una aprobación humana que lo
// llamara. Esa aprobación ya existe (el botón inline del chat), así que el
// atajo por consola sobra — y un atajo que sobra no es neutral: aplica DDL
// irreversible saltándose ddlGuard, la re-verificación de vigencia y el modal
// destructivo, que son EXACTAMENTE los controles que esta cirugía añadió.
// Dejarlo puesto sería dejar una puerta que no pasa por ninguna cerradura.
//
// El test es un grep, y es a propósito: la única forma de que esto vuelva por
// descuido es que alguien lo reintroduzca, y un grep en verde es lo que lo
// impide. Mismo patrón que mainProjectExecSql.test.js.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'src');
const RETIRED = '__forgeApplyMigration';
const SCANNED = ['.ts', '.tsx', '.js', '.jsx'];

/** Recorre src/ y devuelve todas las fuentes. Nunca entra en node_modules. */
function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, acc);
    else if (entry.isFile() && SCANNED.includes(path.extname(entry.name))) acc.push(full);
  }
  return acc;
}

/** src/ entero MÁS el entry point real de la raíz. */
function scanned() {
  const files = collectSourceFiles(SRC_DIR);
  const rootEntry = path.join(ROOT, 'server.js');
  if (fs.existsSync(rootEntry)) files.push(rootEntry);
  return files;
}

test('el walker encuentra fuentes (guarda de que el test no pasa en vacío)', () => {
  const files = scanned();
  assert.ok(files.length > 0, 'no se encontró ninguna fuente que escanear');
  assert.ok(
    files.some(f => f.endsWith(path.join('services', 'MigrationRunner.ts'))),
    'el walker debe llegar al archivo que declaraba el disparador'
  );
  assert.ok(
    files.some(f => f === path.join(ROOT, 'server.js')),
    'server.js de la raíz es el entry point real y también se escanea'
  );
});

test('cero referencias a window.__forgeApplyMigration en todo el código', () => {
  const offenders = [];
  for (const file of scanned()) {
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes(RETIRED)) {
          offenders.push(`  ${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      });
  }

  assert.equal(
    offenders.length,
    0,
    'El disparador TEMPORAL de Cirugía 1 volvió al código:\n\n' +
    offenders.join('\n') +
    '\n\nAplicar una migración pasa por el botón inline del chat\n' +
    '(src/components/forge/DDLApprovalButton.tsx), que re-verifica que la\n' +
    'propuesta siga vigente, corre ddlGuard sobre el SQL y pide confirmación\n' +
    'tecleada si destruye datos. Un atajo global salta esos tres controles\n' +
    'sobre la única operación irreversible del sistema.'
  );
});

test('MigrationRunner no cuelga nada de window', () => {
  const source = fs.readFileSync(path.join(SRC_DIR, 'services', 'MigrationRunner.ts'), 'utf8');

  assert.ok(!/declare\s+global/.test(source), 'no debe ampliar la interfaz Window');
  assert.ok(!/\bwindow\./.test(source), 'no debe escribir en el objeto global');
  // Y sigue exportando lo que el botón necesita: el apply validado en C1 y la
  // lectura del SQL que alimenta a ddlGuard antes de ejecutarlo.
  assert.match(source, /static async applyMigration\(/);
  assert.match(source, /static async readMigrationSql\(/);
});
