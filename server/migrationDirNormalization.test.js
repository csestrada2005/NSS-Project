import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIGRATIONS_DIR,
  isMigrationPath,
  isSqlPath,
  normalizeMigrationDir,
  misplacedMigrations,
  resolveMigrationTargets,
  resolveMigrationRenames,
  ddlProposedTelemetry,
} from '../src/utils/migrationPath.js';

// ---------------------------------------------------------------------------
// CIRUGÍA 2.2 — EL DIRECTORIO DE UNA MIGRACIÓN TAMPOCO LO ELIGE EL MODELO.
//
// EL FALLO QUE ESTO REPARA, tal como ocurrió:
// un proyecto real pidió una tabla, el intent se clasificó `database_change`,
// el plan lane escribió `src/db/migrations/…sql` y TODO lo que reconoce una
// migración se apagó a la vez —el renombrado, la marca [DDL_PROPOSED:], el
// botón de aprobación, el contexto de schema— sin un solo aviso. El intent
// cerró en 'success' con el archivo escrito y la base intacta, que es
// exactamente el silencio que las Cirugías 1 y 2 vinieron a matar.
//
// La causa: la única regla de prompt que nombra el directorio (BACKEND_RULES)
// se inyecta en dos prompts a los que un `database_change` no llega nunca,
// porque laneRouting lo manda siempre al plan lane. El prompt del Architect
// ahora lo dice (y hay un test abajo que impide borrarlo en silencio), pero la
// garantía no puede ser un prompt: la da la normalización determinista.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 7, 25, 12, 0, 0); // 2026-08-25T12:00:00Z

/** Lo que hace AIOrchestrator: resolver destinos y persistir en ellos. */
function persistedPaths(paths, existing, intentType) {
  const targets = resolveMigrationTargets(paths, existing, NOW, {
    normalizeDir: intentType === 'database_change',
  });
  return paths.map((p) => targets.get(p) ?? p);
}

// --- Normalización del directorio -------------------------------------------

test('un .sql fuera de sitio se recoloca conservando su nombre de archivo', () => {
  assert.equal(
    normalizeMigrationDir('src/db/migrations/20240101000000_create_orders.sql'),
    `${MIGRATIONS_DIR}20240101000000_create_orders.sql`
  );
  assert.equal(normalizeMigrationDir('db/init.sql'), `${MIGRATIONS_DIR}init.sql`);
  assert.equal(normalizeMigrationDir('migrations/001_x.sql'), `${MIGRATIONS_DIR}001_x.sql`);
  assert.equal(normalizeMigrationDir('schema.sql'), `${MIGRATIONS_DIR}schema.sql`);
});

test('lo que ya está en su sitio, y lo que no es SQL, salen intactos', () => {
  const good = `${MIGRATIONS_DIR}20260824120000_create_orders.sql`;
  assert.equal(normalizeMigrationDir(good), good);
  assert.equal(normalizeMigrationDir('src/components/Hero.tsx'), 'src/components/Hero.tsx');
  assert.equal(normalizeMigrationDir('src/data/products.ts'), 'src/data/products.ts');
});

test('isSqlPath e isMigrationPath NO son lo mismo, y esa diferencia es el bug', () => {
  const stray = 'src/db/migrations/create_orders.sql';
  assert.equal(isSqlPath(stray), true, 'parece una migración');
  assert.equal(isMigrationPath(stray), false, 'pero el sistema no la reconoce');
  assert.equal(isMigrationPath(normalizeMigrationDir(stray)), true, 'normalizada, sí');
});

// --- El caso real, de punta a punta -----------------------------------------

test('CHECKPOINT: un database_change no cierra con un .sql nuevo fuera del prefijo', () => {
  // Las carpetas que el modelo inventa cuando nadie le dice dónde van.
  const modelPaths = [
    'src/db/migrations/20240101000000_create_orders.sql',
    'db/schema.sql',
    'migrations/001_add_status.sql',
    'src/integrations/supabase/types.ts', // no es SQL: no se toca
  ];

  const persisted = persistedPaths(modelPaths, new Map(), 'database_change');

  // La guarda, en su forma mecánica: cero .sql fuera de sitio.
  assert.deepEqual(
    misplacedMigrations(persisted),
    [],
    'un database_change no puede cerrar con una migración que nadie va a reconocer'
  );
  assert.ok(persisted.every((p) => !isSqlPath(p) || isMigrationPath(p)));
  // El archivo que no es SQL sigue donde el plan lo puso.
  assert.ok(persisted.includes('src/integrations/supabase/types.ts'));
});

test('el caso del bakery: antes no había marca, ahora sí', () => {
  const modelPaths = ['src/db/migrations/20240101000000_create_orders.sql'];

  // ANTES (sin normalizar): el path no es migración, así que la marca sale
  // vacía → sin marca no hay botón, y nadie se entera.
  const before = persistedPaths(modelPaths, new Map(), 'feature');
  assert.deepEqual(before, modelPaths, 'sin normalizar, el path se persiste tal cual');
  assert.equal(ddlProposedTelemetry(before.filter(isMigrationPath)), '');

  // AHORA: el mismo plan, clasificado database_change, produce propuesta.
  const after = persistedPaths(modelPaths, new Map(), 'database_change');
  assert.match(after[0], /^supabase\/migrations\/\d{14}_create_orders\.sql$/);
  assert.equal(
    ddlProposedTelemetry(after.filter(isMigrationPath)),
    ` [DDL_PROPOSED:${after[0]}]`
  );
});

test('la normalización conserva el orden del lote y no colisiona', () => {
  const persisted = persistedPaths(
    ['db/a.sql', 'src/db/b.sql', `${MIGRATIONS_DIR}c.sql`],
    new Map(),
    'database_change'
  );

  assert.equal(new Set(persisted).size, 3, 'tres destinos distintos');
  assert.ok(persisted.every((p) => isMigrationPath(p)));
  // El prefijo temporal crece con el orden del plan: es lo que ordena la
  // aplicación de un lote cuyas migraciones dependen unas de otras.
  const stamps = persisted.map((p) => p.slice(MIGRATIONS_DIR.length, MIGRATIONS_DIR.length + 14));
  assert.deepEqual([...stamps].sort(), stamps, `${stamps.join(' < ')}`);
});

test('un destino ya ocupado en el proyecto no se pisa', () => {
  const existing = new Map([[`${MIGRATIONS_DIR}20260825120000_a.sql`, 'create table a();']]);
  const [persisted] = persistedPaths(['db/a.sql'], existing, 'database_change');

  assert.ok(isMigrationPath(persisted));
  assert.ok(!existing.has(persisted), 'el nuevo busca hueco en vez de sobrescribir');
});

// --- Lo que la normalización NO hace ----------------------------------------

test('un .sql PREEXISTENTE fuera de sitio no se mueve: se avisa', () => {
  // Moverlo sería borrar y recrear a espaldas del usuario, y dejaría la vieja
  // huérfana con su contenido antiguo — el mismo fallo que la regla "sólo se
  // renombra lo NUEVO" evita desde Cirugía 1.
  const legacy = 'src/db/migrations/20240101000000_create_orders.sql';
  const existing = new Map([[legacy, 'create table orders();']]);

  const persisted = persistedPaths([legacy], existing, 'database_change');
  assert.deepEqual(persisted, [legacy], 'se queda donde está');
  // Y por eso la guarda lo reporta: es lo que alimenta [DDL_MISPLACED:] y el
  // aviso del chat. Antes esto era silencio.
  assert.deepEqual(misplacedMigrations(persisted), [legacy]);
});

test('sin normalizeDir (intent que no es database_change) no se mueve nada', () => {
  const stray = ['src/db/seed.sql'];
  assert.deepEqual(persistedPaths(stray, new Map(), 'feature'), stray);
  // resolveMigrationRenames es esa misma puerta cerrada, y sigue siéndolo.
  assert.equal(resolveMigrationRenames(stray, new Map(), NOW).size, 0);
});

test('misplacedMigrations sólo mira .sql, y deduplica', () => {
  assert.deepEqual(
    misplacedMigrations(['src/App.tsx', 'db/a.sql', 'db/a.sql', `${MIGRATIONS_DIR}b.sql`]),
    ['db/a.sql']
  );
  assert.deepEqual(misplacedMigrations([]), []);
  assert.deepEqual(misplacedMigrations(null), []);
});

// --- Efecto colateral verificado: el contexto de schema deja de ser ciego ---

test('BONUS: la normalización cura la ceguera de ProjectMemoryService sin tocarlo', () => {
  // ProjectMemoryService.extractDatabaseSchema alimenta el `database_schema`
  // que vuelve al modelo en prompts posteriores, y filtra por EL MISMO prefijo.
  // Una migración fuera de sitio también era invisible ahí: el modelo no veía
  // el schema que él mismo acababa de escribir.
  //
  // No se puede importar ese método desde `node --test` (es TypeScript y es
  // privado), así que lo que se fija aquí es el ACOPLAMIENTO: la condición
  // exacta que usa, anclada contra su fuente, más la prueba de que el path
  // normalizado la satisface y el original no. Si esa condición cambia, este
  // test cae y el razonamiento se revisa en vez de envejecer callado.
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'ProjectMemoryService.ts'),
    'utf8'
  );
  assert.match(
    source,
    /path\.startsWith\('supabase\/migrations\/'\)\s*&&\s*path\.endsWith\('\.sql'\)/,
    'extractDatabaseSchema ya no filtra por el prefijo: revisa este test'
  );

  const seenByMemory = (p) => p.startsWith(MIGRATIONS_DIR) && p.endsWith('.sql');

  const stray = 'src/db/migrations/20240101000000_create_orders.sql';
  assert.equal(seenByMemory(stray), false, 'antes: el modelo no veía su propio schema');

  const [persisted] = persistedPaths([stray], new Map(), 'database_change');
  assert.equal(seenByMemory(persisted), true, 'después: lo ve, sin tocar ProjectMemoryService');
});

// --- El prompt no se puede borrar en silencio -------------------------------

test('el prompt del Architect nombra el directorio de migraciones', () => {
  // La normalización es la garantía; el prompt es la tasa de acierto. Si alguien
  // quita la regla, que sea a la vista.
  const architect = fs.readFileSync(path.join(ROOT, 'src', 'services', 'Architect.ts'), 'utf8');

  assert.match(architect, /supabase\/migrations\//, 'el Architect elige el file_path del plan');
  assert.match(architect, /DATABASE \/ MIGRATION RULE/);
});

// ---------------------------------------------------------------------------
// UN MENSAJE POR CAUSA — la auditoría de dependencias no es una reparación.
//
// `auditDependencies` (determinista, sin LLM) escribe package.json para
// declarar los imports del código recién generado. Como package.json no es el
// file_path de ningún step del plan, caía en `extras` y heredaba el mensaje de
// las reparaciones del Verifier fuera del plan: "reparé además un error
// preexistente en: package.json". No había ningún error, y menos preexistente.
//
// Las dos causas viven en la misma función privada de un .ts, así que lo que se
// fija aquí es que sigan SEPARADAS en la fuente. Si alguien vuelve a meter el
// path de la auditoría en `extras`, este test cae.
// ---------------------------------------------------------------------------

test('el aviso de la auditoría de dependencias no se mezcla con el de reparación', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'AIOrchestrator.ts'),
    'utf8'
  );

  assert.match(
    source,
    /const extras = diffPaths\.filter\(p => !planPaths\.has\(p\) && p !== auditedPath\)/,
    'package.json de la auditoría debe quedar FUERA de extras'
  );
  assert.match(
    source,
    /Añadí \$\{auditedDeps\.join\(', '\)\} a package\.json porque el código nuevo/,
    'la auditoría dice su propia causa'
  );
  assert.match(
    source,
    /Reparé además un error preexistente en: \$\{extras\.join\(', '\)\}/,
    'y la reparación real conserva la suya'
  );
});
