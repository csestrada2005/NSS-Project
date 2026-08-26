import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { touchesMigrations, MIGRATIONS_SEGMENT } from '../src/utils/migrationGate.js';

// ---------------------------------------------------------------------------
// CIRUGÍA C-D — EL GATE DE MIGRACIONES SE ACTIVA POR CONTENIDO, NO POR ETIQUETA.
//
// EL AGUJERO, tal como estaba: las dos guardas de migraciones del orquestador
// —el barrido de huérfanos (C-D'') y la normalización de directorio (2.2)—
// colgaban ambas de `intent.type === 'database_change'` y de nada más. Esa
// etiqueta la produce el clasificador, que es un LLM: acierta casi siempre,
// pero cuando no, un `.sql` que llega al plan bajo `modify_existing` esquiva el
// barrido ENTERO. Ni recolocación, ni renombrado, ni marca [DDL_PROPOSED:], ni
// botón de aprobación, ni contexto de schema de vuelta al modelo. El silencio
// que las Cirugías 1, 2 y 2.2 vinieron a matar, entrando por la última puerta
// abierta.
//
// LA REPARACIÓN: la rama por tipo se queda intacta y se le suma un OR por
// CONTENIDO del plan. Añade activaciones, no quita ninguna.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- El predicado -----------------------------------------------------------

test('C-D: un .sql bajo el prefijo real activa el gate', () => {
  assert.equal(touchesMigrations(['supabase/migrations/20240101_x.sql']), true);
});

test('C-D: un .sql suelto, viva donde viva, activa el gate', () => {
  // Ésta es la mitad que la etiqueta se comía: el plan trae DDL y el
  // clasificador no lo llamó database_change.
  assert.equal(touchesMigrations(['foo/bar.sql']), true);
  assert.equal(touchesMigrations(['src/db/migrations/create_orders.sql']), true);
  assert.equal(touchesMigrations(['schema.sql']), true);
});

test('C-D: cualquier cosa bajo supabase/migrations/ activa el gate, sea .sql o no', () => {
  // No exige extensión: si el lote está escribiendo DENTRO del directorio de
  // migraciones, este intent trabaja ahí y hay que mirar.
  assert.equal(touchesMigrations(['supabase/migrations/README.md']), true);
  assert.equal(touchesMigrations(['apps/web/supabase/migrations/notes.txt']), true);
});

test('C-D: un lote de front puro NO activa el gate', () => {
  assert.equal(touchesMigrations(['src/App.tsx']), false);
  assert.equal(touchesMigrations(['src/components/Header.tsx']), false);
  assert.equal(
    touchesMigrations(['src/App.tsx', 'src/components/Header.tsx', 'package.json']),
    false
  );
});

test('C-D: un lote vacío NO activa el gate', () => {
  assert.equal(touchesMigrations([]), false);
});

test('C-D: el segmento es completo, no subcadena', () => {
  assert.equal(touchesMigrations(['mysupabase/migrations/x.md']), false);
  assert.equal(touchesMigrations([`${MIGRATIONS_SEGMENT}x.md`]), true);
});

test('C-D: separadores y mayúsculas no son una vía de escape', () => {
  assert.equal(touchesMigrations(['supabase\\migrations\\20240101_x.sql']), true);
  assert.equal(touchesMigrations(['./src/DB/CREATE_ORDERS.SQL']), true);
  assert.equal(touchesMigrations(['supabase\\migrations\\README.md']), true);
});

test('C-D: fail-closed — ante la duda, activo', () => {
  // Un elemento que no sabemos leer no se puede DESCARTAR: descartarlo es
  // exactamente el fallo caro. Activar de más sobre un lote sin migraciones no
  // hace nada (los dos cuerpos ignoran lo que no es .sql).
  assert.equal(touchesMigrations([null]), true);
  assert.equal(touchesMigrations([{ path: 'x.sql' }]), true);
  assert.equal(touchesMigrations(42), true, 'ni siquiera es recorrible');
  // Ausencia no es duda: no hay nada que mirar, igual que [].
  assert.equal(touchesMigrations(null), false);
  assert.equal(touchesMigrations(undefined), false);
});

// --- El gate compuesto ------------------------------------------------------

/**
 * El gate tal como queda en AIOrchestrator, en sus dos sitios: la rama por tipo
 * INTACTA, más la rama por contenido. El bucle real vive en un método privado
 * de un .ts que `node --test` no puede importar (mismo arreglo que los tests de
 * C-D''), así que aquí se modela la condición y abajo se ancla su forma en la
 * fuente.
 */
const gateActive = (intentType, paths) =>
  intentType === 'database_change' || touchesMigrations(paths);

test('C-D: paths con .sql bajo modify_existing → gate ACTIVO (por contenido)', () => {
  // El caso que motivó la cirugía: el clasificador falló la etiqueta y la DDL
  // habría pasado de largo.
  assert.equal(gateActive('modify_existing', ['src/App.tsx', 'db/add_status.sql']), true);
  assert.equal(gateActive('new_feature', ['supabase/migrations/20240101_x.sql']), true);
});

test('C-D: paths sólo .tsx bajo database_change → gate ACTIVO (por tipo)', () => {
  // La rama vieja no se toca: un database_change sigue activando el barrido
  // aunque su plan todavía no traiga un path reconocible — ahí es donde el
  // barrido de huérfanos tiene que mirar el proyecto entero.
  assert.equal(gateActive('database_change', ['src/App.tsx']), true);
  assert.equal(gateActive('database_change', []), true);
});

test('C-D: paths sólo .tsx bajo modify_existing → gate INACTIVO', () => {
  // Y no se activa de más: un intent de front sin un solo path de base de datos
  // sigue sin pagar el barrido.
  assert.equal(gateActive('modify_existing', ['src/App.tsx', 'src/components/Header.tsx']), false);
});

// --- El acoplamiento con la fuente ------------------------------------------

test('C-D: los DOS sitios del orquestador gatean por tipo O por contenido', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'AIOrchestrator.ts'),
    'utf8'
  );

  assert.match(
    source,
    /import \{ touchesMigrations \} from '\.\.\/utils\/migrationGate\.js';/,
    'el predicado entra desde el módulo puro'
  );
  assert.match(
    source,
    /const sweptOrphans = \(intent\.type === 'database_change' \|\| touchesMigrations\(diffPaths\)\)/,
    'sitio 1 — el barrido de huérfanos también dispara por contenido del diff'
  );
  assert.match(
    source,
    /normalizeDir: intent\.type === 'database_change' \|\| touchesMigrations\(migrationInputPaths\),/,
    'sitio 2 — la normalización de directorio, igual'
  );

  // La rama por tipo NO se quita en ninguno de los dos: esto AÑADE.
  const gates = source.match(/intent\.type === 'database_change' \|\| touchesMigrations\(/g) ?? [];
  assert.equal(gates.length, 2, 'exactamente los dos sitios, ambos con las dos ramas');
});
