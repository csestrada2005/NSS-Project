import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// REGLA DURA — AIOrchestrator.logIntent() es el ÚNICO escritor de
// forge_intent_log.
//
// POR QUÉ SE VERIFICA MECÁNICAMENTE Y NO "por convención"
// -------------------------------------------------------
// La fila de forge_intent_log es la única memoria consultable del pipeline:
// qué se pidió, qué lane corrió, qué archivos salieron, y —vía los sufijos del
// user_prompt— qué se reparó, qué se rechazó y qué DDL quedó propuesto o
// aplicado. Un segundo escritor no rompe nada el día que se añade; rompe el día
// que diverge: otro criterio de qué cuenta como outcome, otro juego de columnas
// rellenadas, otra manera de olvidarse del user_id. A partir de ahí las
// consultas mienten y nadie se entera, porque el log no tiene quien lo audite.
//
// Este test es esa auditoría. Es un grep sin allowlist, igual que
// mainProjectExecSql.test.js.
//
// Nota sobre MigrationRunner: cierra sus intentos por
// AIOrchestrator.logMigrationIntent(), que NO inserta — delega en logIntent.
// Por eso este test sigue viendo un único `.insert()`, que es exactamente lo
// que la regla pide.
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TABLE = 'forge_intent_log';
const WRITE_VERB = /\.\s*(insert|upsert|update|delete)\s*\(/;
/** Ventana tras el nombre de la tabla donde puede caer el verbo encadenado. */
const CHAIN_WINDOW = 200;

/**
 * Blanquea COMENTARIOS preservando longitud y saltos de línea, para que las
 * líneas reportadas sigan siendo las del archivo real.
 *
 * Hace falta porque este archivo —y la cabecera de MigrationRunner— DESCRIBEN
 * la regla citando `forge_intent_log` y `.insert(` en prosa. Sin esto el propio
 * comentario que explica la regla la haría fallar, y el arreglo tentador sería
 * dejar de escribir el comentario: exactamente al revés de lo que interesa.
 *
 * Los literales NO se enmascaran: el nombre de la tabla vive dentro de uno
 * (`.from('forge_intent_log')`) y es justo lo que hay que encontrar. El estado
 * de comilla simple/doble se reinicia en cada salto de línea (una cadena JS no
 * los cruza sin escapar), así que un apóstrofo suelto en JSX no puede tragarse
 * medio archivo.
 */
function stripComments(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  let i = 0;
  let quote = null; // "'", '"' o '`'
  while (i < src.length) {
    const ch = src[i];

    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) { quote = null; i++; continue; }
      if (ch === '\n' && quote !== '`') { quote = null; i++; continue; }
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; i++; continue; }

    if (src.slice(i, i + 2) === '//') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      blank(i, j);
      i = j;
      continue;
    }

    if (src.slice(i, i + 2) === '/*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? src.length : j + 2;
      blank(i, j);
      i = j;
      continue;
    }

    i++;
  }

  return out.join('');
}

function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      acc.push(full);
    }
  }
  return acc;
}

/** Escrituras contra forge_intent_log en un archivo: [{ file, line }]. */
function writesInFile(file) {
  const content = stripComments(fs.readFileSync(file, 'utf8'));
  const hits = [];
  let from = 0;
  for (;;) {
    const at = content.indexOf(TABLE, from);
    if (at === -1) break;
    from = at + TABLE.length;
    const chain = content.slice(at, at + CHAIN_WINDOW);
    if (!WRITE_VERB.test(chain)) continue;
    const line = content.slice(0, at).split('\n').length;
    hits.push({ file: path.relative(path.join(SRC_DIR, '..'), file), line });
  }
  return hits;
}

test('el walker encuentra fuentes en src/ (guarda de que el test no pasa en vacío)', () => {
  const files = collectSourceFiles(SRC_DIR);
  assert.ok(files.length > 0, 'no se encontró ningún .ts/.tsx bajo src/');
});

test('stripComments borra la prosa y respeta el código', () => {
  // Guarda del propio test: si el stripper dejara de funcionar, los comentarios
  // que citan la regla volverían a contar como infracciones de la regla.
  const src = [
    "// from('forge_intent_log').insert({ ... })",
    "await supabase.from('forge_intent_log').insert({ a: 1 });",
    "/* .from('forge_intent_log').update({}) */",
  ].join('\n');
  const stripped = stripComments(src);
  assert.equal(stripped.length, src.length, 'debe preservar longitud');
  assert.equal(stripped.split('\n').length, 3, 'debe preservar saltos de línea');
  assert.equal(stripped.split('\n')[0].trim(), '', 'la línea de comentario queda en blanco');
  assert.ok(stripped.includes("await supabase.from('forge_intent_log').insert({ a: 1 });"));
  assert.ok(!stripped.includes('update'));
});

test('el detector reconoce una escritura y no confunde una lectura', () => {
  // Guarda del propio test: si WRITE_VERB dejara de casar, todo lo de abajo
  // pasaría en vacío y la regla quedaría sin vigilar.
  assert.match(".from('forge_intent_log').insert({", WRITE_VERB);
  assert.match(".from('forge_intent_log')\n        .update({", WRITE_VERB);
  assert.ok(!WRITE_VERB.test(".from('forge_intent_log').select('user_prompt')"));
});

test('sólo AIOrchestrator.ts escribe en forge_intent_log', () => {
  const offenders = [];
  for (const file of collectSourceFiles(SRC_DIR)) {
    if (path.basename(file) === 'AIOrchestrator.ts') continue;
    offenders.push(...writesInFile(file));
  }

  assert.deepEqual(
    offenders,
    [],
    'REGLA DURA VIOLADA: hay un segundo escritor de forge_intent_log.\n\n' +
      offenders.map(o => `  ${o.file}:${o.line}`).join('\n') +
      '\n\nAIOrchestrator.logIntent() es el único escritor. Un caller que necesite\n' +
      'registrar un intent debe pasar por él (ver logMigrationIntent, que delega\n' +
      'sin insertar), nunca abrir su propia inserción.'
  );
});

test('AIOrchestrator.ts contiene exactamente UNA escritura', () => {
  const writes = writesInFile(path.join(SRC_DIR, 'services', 'AIOrchestrator.ts'));
  assert.equal(
    writes.length,
    1,
    'logIntent es el único punto de inserción; se encontraron ' +
      `${writes.length}: ${writes.map(w => `${w.file}:${w.line}`).join(', ')}`
  );
});

test('MigrationRunner no toca forge_intent_log directamente', () => {
  // Su telemetría va por AIOrchestrator.logMigrationIntent().
  const file = path.join(SRC_DIR, 'services', 'MigrationRunner.ts');
  const raw = fs.readFileSync(file, 'utf8');
  const content = stripComments(raw);
  assert.ok(
    !content.includes(TABLE),
    'MigrationRunner.ts no debe nombrar forge_intent_log: su único camino al log ' +
      'es AIOrchestrator.logMigrationIntent().'
  );
  assert.ok(
    content.includes('logMigrationIntent'),
    'MigrationRunner debe cerrar sus intentos por logMigrationIntent().'
  );
  assert.ok(
    raw.includes(TABLE),
    'la cabecera de MigrationRunner sí explica adónde va su telemetría — si deja ' +
      'de nombrarla, este test estaría pasando por el motivo equivocado.'
  );
});
