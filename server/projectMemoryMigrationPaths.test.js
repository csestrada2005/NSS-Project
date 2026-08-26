import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import {
  MIGRATIONS_DIR,
  isMigrationPath,
  resolveMigrationTargets,
} from '../src/utils/migrationPath.js';

// ---------------------------------------------------------------------------
// C-F — DOS DEFECTOS CON LA MISMA ANATOMÍA: LA MEMORIA MIRABA EL MUNDO DE ANTES.
//
// `database_schema` es lo único que le dice al modelo qué tablas existen ya.
// Se calcula recorriendo un mapa de archivos y quedándose con las migraciones.
// Los dos defectos que este archivo fija atacan esa frase por sus dos mitades:
//
//  (1) QUÉ CUENTA COMO MIGRACIÓN. `extractDatabaseSchema` traía su propio
//      reconocedor escrito a mano —`path.startsWith('supabase/migrations/') &&
//      path.endsWith('.sql')`— que era una copia literal de `isMigrationPath`.
//      Dos copias de un predicado son dos predicados en cuanto una cambia, y
//      ya habían divergido: la real acepta `.SQL` en mayúsculas (compara en
//      minúsculas), la copia no. Una migración así se escribía, se aprobaba y
//      NO existía para el modelo.
//
//  (2) QUÉ MAPA SE RECORRE. El orquestador normaliza los paths de las
//      migraciones (`src/db/migrations/x.sql` → `supabase/migrations/<ts>_x.sql`)
//      y persiste en el destino, pero a la memoria le pasaba `finalFiles`: el
//      mapa del Verifier, con las claves de ANTES de normalizar. La migración
//      quedaba en forge_files bajo el path bueno y en la memoria bajo el malo
//      —el que no empieza por el prefijo— así que desaparecía del schema.
//
// La misma anatomía: el archivo correcto en el sitio correcto, invisible para
// el modelo, y el intent cerrando en 'success' sin decir nada. Es el silencio
// que la Cirugía 2.2 vino a matar, superviviendo un paso más abajo.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = path.join(ROOT, 'src', 'services', 'ProjectMemoryService.ts');
const NOW = Date.UTC(2026, 7, 25, 12, 0, 0); // 2026-08-25T12:00:00Z
const STAMP = '20260825120000';

// --- Carga del servicio real (mismo aparato que projectMemorySchema.test.js)--
//
// Se compila el ProjectMemoryService REAL con esbuild y se sustituye sólo su
// frontera de persistencia por una tabla en memoria. Lo que se prueba es el
// código de producción, no una copia — que es justo el punto de todo esto.

const STUB = `
const store = () => globalThis.__PM_TEST_STORE__;
function from(table) {
  return {
    upsert: async (payload) => {
      const s = store();
      s.rows.set(payload.project_id, JSON.parse(JSON.stringify(payload)));
      return { data: payload, error: null };
    },
    select: () => ({
      eq: (_col, value) => ({
        maybeSingle: async () => ({ data: store().rows.get(value) ?? null, error: null }),
      }),
    }),
  };
}
export class SupabaseService {
  static getInstance() {
    return { client: { from } };
  }
}
`;

const supabaseStub = {
  name: 'supabase-stub',
  setup(build) {
    build.onResolve({ filter: /SupabaseService$/ }, () => ({
      path: 'supabase-stub',
      namespace: 'pm-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'pm-stub' }, () => ({
      contents: STUB,
      loader: 'js',
    }));
  },
};

const bundle = await esbuild.build({
  entryPoints: [SERVICE],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  plugins: [supabaseStub],
});
const CODE = bundle.outputFiles[0].text;

let loadCount = 0;
async function loadService() {
  const store = { rows: new Map() };
  globalThis.__PM_TEST_STORE__ = store;
  const src = `${CODE}\n//${loadCount++}`;
  const url = `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
  const mod = await import(url);
  return { ProjectMemoryService: mod.ProjectMemoryService, store };
}

// --- Fixtures ---------------------------------------------------------------

function baseFiles(overrides = {}) {
  const files = new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '^19.2.0' } })],
    ['src/App.tsx', '<Route path="/" element={<Home />} />'],
    ['src/types.ts', 'export interface User { id: string; }\n'],
    [
      `${MIGRATIONS_DIR}20260101000000_init.sql`,
      'create table public.users (id uuid primary key);',
    ],
  ]);
  for (const [k, v] of Object.entries(overrides)) files.set(k, v);
  return files;
}

const PEDIDOS_SQL = 'create table public.pedidos_cf (id uuid primary key);';

/**
 * El puente REAL del orquestador, modelado paso a paso: resolver destinos,
 * persistir en ellos, y —lo que este PR añade— entregar a la memoria el mapa
 * YA renombrado en vez del mapa del Verifier.
 *
 * El bucle vive en un método privado de un .ts que `node --test` no puede
 * importar; el test de acoplamiento del final ancla que la fuente siga
 * haciendo exactamente esto.
 */
function orchestratorBridge(finalFiles, originalFiles, inputPaths, intentType) {
  const renames = resolveMigrationTargets(inputPaths, originalFiles, NOW, {
    normalizeDir: intentType === 'database_change',
  });
  const memoryFiles = new Map(finalFiles);
  for (const [from, to] of renames) {
    memoryFiles.set(to, finalFiles.get(from) ?? originalFiles.get(from));
  }
  for (const from of renames.keys()) memoryFiles.delete(from);
  return {
    renames,
    memoryFiles,
    persistedPaths: inputPaths.map((p) => renames.get(p) ?? p),
  };
}

/** Cuántas veces aparece `needle` en `haystack`. */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------------
// DEFECTO 1 — UN SOLO RECONOCEDOR
// ---------------------------------------------------------------------------

test('C-F/1: el schema reconoce lo que reconoce migrationPath.js, no una copia', async () => {
  // `.SQL` en mayúsculas es el discriminante: es una migración para
  // `isMigrationPath` (compara en minúsculas) y NO lo era para la copia a mano
  // que vivía en extractDatabaseSchema. Si alguien revierte el one-liner a
  // `path.endsWith('.sql')`, esta tabla vuelve a desaparecer del contexto del
  // modelo y este test cae.
  const upper = `${MIGRATIONS_DIR}20260825120000_create_pedidos.SQL`;
  assert.equal(isMigrationPath(upper), true, 'premisa: el reconocedor real la acepta');
  assert.equal(
    upper.endsWith('.sql'),
    false,
    'premisa: la copia a mano NO la aceptaba — ahí está la divergencia'
  );

  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'cf-recognizer';

  await ProjectMemoryService.buildFromFiles(projectId, baseFiles());
  await ProjectMemoryService.updateAfterChange(
    projectId,
    [upper],
    baseFiles({ [upper]: PEDIDOS_SQL })
  );

  const saved = store.rows.get(projectId);
  assert.ok(
    saved.database_schema.includes('public.pedidos_cf'),
    'la migración .SQL debe estar en el schema: el reconocedor es UNO'
  );
  assert.ok(
    saved.database_schema.includes('public.users'),
    'y lo que ya había sigue estando'
  );
});

test('C-F/1: el reconocedor único, anclado en la fuente', () => {
  const source = fs.readFileSync(SERVICE, 'utf8');

  assert.match(
    source,
    /import \{[^}]*\bisMigrationPath\b[^}]*\}\s*from\s*'\.\.\/utils\/migrationPath\.js'/,
    'ProjectMemoryService importa el reconocedor de migrationPath.js'
  );
  assert.match(
    source,
    /if \(isMigrationPath\(path\) \|\| path === 'src\/types\.ts'\)/,
    'y extractDatabaseSchema lo USA — no lo reimplementa'
  );
  assert.doesNotMatch(
    source,
    /startsWith\('supabase\/migrations\/'\)/,
    'no queda ninguna copia a mano del prefijo en ProjectMemoryService'
  );
});

// ---------------------------------------------------------------------------
// DEFECTO 2 — EL MAPA POST-RENAME
// ---------------------------------------------------------------------------

test('C-F/2: una migración mal ubicada entra al schema bajo su path NUEVO', async () => {
  const stray = 'src/db/migrations/20240101000000_create_pedidos.sql';
  const expected = `${MIGRATIONS_DIR}${STAMP}_create_pedidos.sql`;

  // El intent escribe el .sql donde el plan se lo inventó. `finalFiles` es el
  // mapa del Verifier: claves PRE-normalización.
  const originalFiles = baseFiles();
  const finalFiles = baseFiles({ [stray]: PEDIDOS_SQL });

  const { memoryFiles, persistedPaths } = orchestratorBridge(
    finalFiles,
    originalFiles,
    [stray],
    'database_change'
  );
  assert.deepEqual(persistedPaths, [expected], 'premisa: se persiste en el path normalizado');

  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'cf-post-rename';

  await ProjectMemoryService.buildFromFiles(projectId, originalFiles);
  await ProjectMemoryService.updateAfterChange(projectId, persistedPaths, memoryFiles);

  const saved = store.rows.get(projectId);
  assert.ok(
    saved.database_schema.includes('public.pedidos_cf'),
    'la tabla debe estar en el schema que vuelve al modelo'
  );
  assert.ok(
    saved.database_schema.includes(`-- ${expected}`),
    'y bajo la cabecera del path NUEVO, que es donde de verdad quedó escrita'
  );
  assert.ok(
    !saved.database_schema.includes('src/db/migrations/'),
    'el path inventado por el plan no sobrevive en la memoria'
  );
});

test('C-F/2: control negativo — el mapa PRE-rename es exactamente el defecto', async () => {
  // La otra mitad del test de arriba: con el mapa que se pasaba antes
  // (`finalFiles`, claves sin normalizar) la tabla NO llega al schema. Esto es
  // la mutación del defecto 2, escrita como aserción: si alguien devuelve
  // `finalFiles` al call site, el test de arriba cae y éste explica por qué.
  const stray = 'src/db/migrations/20240101000000_create_pedidos.sql';
  const finalFiles = baseFiles({ [stray]: PEDIDOS_SQL });

  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'cf-pre-rename';

  await ProjectMemoryService.buildFromFiles(projectId, baseFiles());
  await ProjectMemoryService.updateAfterChange(
    projectId,
    [`${MIGRATIONS_DIR}${STAMP}_create_pedidos.sql`],
    finalFiles
  );

  const saved = store.rows.get(projectId);
  assert.ok(
    !saved.database_schema.includes('public.pedidos_cf'),
    'con las claves viejas la migración es invisible — ése era el fallo'
  );
});

test('C-F/2: un renombrado DENTRO del prefijo no duplica la migración', async () => {
  // El origen se vacía del mapa, no sólo se añade el destino. Si sólo se
  // añadiera, viejo y nuevo empezarían los dos por `supabase/migrations/`,
  // pasarían los dos el filtro, y la misma tabla entraría DOS VECES en el
  // contexto del modelo.
  const collided = `${MIGRATIONS_DIR}20240101000000_create_pedidos.sql`;
  const expected = `${MIGRATIONS_DIR}${STAMP}_create_pedidos.sql`;

  const originalFiles = baseFiles();
  const finalFiles = baseFiles({ [collided]: PEDIDOS_SQL });

  const { memoryFiles, persistedPaths } = orchestratorBridge(
    finalFiles,
    originalFiles,
    [collided],
    'database_change'
  );
  assert.deepEqual(persistedPaths, [expected], 'premisa: el prefijo canónico del LLM se re-sella');
  assert.equal(memoryFiles.has(collided), false, 'el origen sale del mapa de la memoria');

  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'cf-no-dup';

  await ProjectMemoryService.buildFromFiles(projectId, originalFiles);
  await ProjectMemoryService.updateAfterChange(projectId, persistedPaths, memoryFiles);

  const saved = store.rows.get(projectId);
  assert.equal(
    count(saved.database_schema, 'public.pedidos_cf'),
    1,
    'la tabla aparece UNA vez en el schema, no dos'
  );
  assert.ok(saved.database_schema.includes(`-- ${expected}`));
});

test('C-F/2: el puente post-rename, anclado en AIOrchestrator', () => {
  // El bucle vive en un método privado de un .ts que `node --test` no puede
  // importar, así que se ancla que la fuente siga haciendo las tres cosas que
  // `orchestratorBridge` modela: copiar el mapa, escribir cada destino con la
  // misma caída de contenido que la persistencia, vaciar cada origen — y que
  // el resultado sea lo que recibe la memoria.
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'AIOrchestrator.ts'),
    'utf8'
  );

  assert.match(
    source,
    /const memoryFiles = new Map\(finalFiles\);/,
    'el mapa de la memoria parte del resultado del Verifier'
  );
  assert.match(
    source,
    /for \(const \[from, to\] of migrationRenames\) \{\s*\n\s*memoryFiles\.set\(to, finalFiles\.get\(from\) \?\? files\.get\(from\)!\);/,
    'y consume el mapa viejo→nuevo con la MISMA caída de contenido que la persistencia'
  );
  assert.match(
    source,
    /for \(const from of migrationRenames\.keys\(\)\) memoryFiles\.delete\(from\);/,
    'los orígenes se vacían, y después de todas las escrituras'
  );
  assert.match(
    source,
    /ProjectMemoryService\.updateAfterChange\(projectId, \[\.\.\.persistedPaths, \.\.\.removedPaths\], memoryFiles\)/,
    'la memoria recibe el mapa POST-rename, no finalFiles'
  );
});
