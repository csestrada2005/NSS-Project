import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// ---------------------------------------------------------------------------
// C3.1 — LA MEMORIA DEL PROYECTO APRENDE EL SCHEMA DESPUÉS DEL BOOTSTRAP.
//
// EL FALLO QUE ESTO REPARA:
// `buildFromFiles` calcula `database_schema` una sola vez, en el bootstrap del
// proyecto. A partir de ahí, cada cambio pasa por `updateAfterChange`, que
// recomputaba `component_registry` y NADA MÁS. Consecuencia: una migración
// escrita por un `database_change` —justo el archivo cuya existencia motiva
// toda la Cirugía— jamás entraba en la memoria. El contexto de schema que el
// modelo recibe quedaba congelado en el estado del primer día, y la siguiente
// migración se escribía contra un mundo que ya no existía.
//
// LA DOCTRINA QUE ESTO FIJA:
// `database_schema` es la INTENCIÓN ACUMULADA EN LOS ARCHIVOS del proyecto
// (supabase/migrations/*.sql + src/types.ts), no una introspección de la base
// viva. Por eso se recalcula entero desde `allFiles`, con la misma función que
// usa `buildFromFiles`: los archivos son la única fuente. El contrapeso de
// realidad son las marcas [DDL_OUTCOME:] del log de intents, que sí dicen qué
// llegó a ejecutarse. La divergencia archivo/base es una propiedad conocida y
// deliberada de este diseño, no un bug: un DDL propuesto y no aplicado sigue
// siendo lo que el proyecto QUIERE ser.
//
// De ahí los dos espejos de abajo: si la migración entra en `allFiles`, el
// schema la contiene; si desaparece de `allFiles`, el schema la pierde. Revertir
// la línea `existing.database_schema = this.extractDatabaseSchema(allFiles)`
// rompe ambos.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = path.join(ROOT, 'src', 'services', 'ProjectMemoryService.ts');

// --- Carga del servicio real -------------------------------------------------
//
// ProjectMemoryService es TypeScript y cuelga de SupabaseService → src/config.ts,
// que lee `import.meta.env` (Vite) al importarse y por tanto no arranca bajo
// node. Se compila el servicio REAL con esbuild y se sustituye únicamente su
// frontera de persistencia por una tabla en memoria: lo que se prueba es el
// código de producción, no una copia.

const STUB = `
const store = () => globalThis.__PM_TEST_STORE__;
function from(table) {
  return {
    upsert: async (payload) => {
      const s = store();
      s.upserts.push({ table, payload });
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
/** Instancia fresca del servicio (cache de memoria propia) + su tabla en memoria. */
async function loadService() {
  const store = { rows: new Map(), upserts: [] };
  globalThis.__PM_TEST_STORE__ = store;
  // El sufijo hace única la data URL: cada test recibe su propio módulo, con su
  // propio memoryCache de 30 s.
  const src = `${CODE}\n//${loadCount++}`;
  const url = `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
  const mod = await import(url);
  return { ProjectMemoryService: mod.ProjectMemoryService, store };
}

// --- Fixtures ----------------------------------------------------------------

const MIGRATION_X = 'supabase/migrations/20260825120000_create_reviews_c3.sql';
const MIGRATION_X_SQL = [
  'create table public.reviews_c3 (',
  '  id uuid primary key default gen_random_uuid(),',
  '  rating int not null',
  ');',
].join('\n');

const TYPES_V1 = 'export interface User { id: string; email: string; }\n';
const TYPES_V2 = 'export interface User { id: string; email: string; }\nexport interface ReviewC3 { id: string; rating: number; }\n';

/** Proyecto ya bootstrappeado: una migración inicial, tipos, y algo de UI. */
function baseFiles(overrides = {}) {
  const files = new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '^19.2.0' } })],
    ['src/index.css', ':root { --brand: #000; }'],
    ['src/App.tsx', '<Route path="/" element={<Home />} />'],
    ['src/components/Header.tsx', 'export function Header() { return null; }'],
    ['src/types.ts', TYPES_V1],
    [
      'supabase/migrations/20260101000000_init.sql',
      'create table public.users (id uuid primary key);',
    ],
  ]);
  for (const [k, v] of Object.entries(overrides)) files.set(k, v);
  return files;
}

// --- Espejo 1: lo que aparece en los archivos, aparece en el schema ----------

test('una migración escrita tras el bootstrap entra en database_schema', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'c3-gana';

  const built = await ProjectMemoryService.buildFromFiles(projectId, baseFiles());
  assert.ok(
    built.database_schema.includes('public.users'),
    'el schema del bootstrap debe contener la migración inicial'
  );
  assert.ok(
    !built.database_schema.includes('reviews_c3'),
    'guarda: la memoria NO puede nacer sabiendo de reviews_c3'
  );

  const allFiles = baseFiles({ [MIGRATION_X]: MIGRATION_X_SQL });
  await ProjectMemoryService.updateAfterChange(projectId, [MIGRATION_X], allFiles);

  const saved = store.rows.get(projectId);
  assert.ok(saved, 'updateAfterChange debe persistir la memoria');
  assert.ok(
    saved.database_schema.includes('reviews_c3'),
    'la migración nueva debe estar en el schema persistido'
  );
  assert.ok(
    saved.database_schema.includes(MIGRATION_X),
    'el schema debe conservar la cabecera "-- <ruta>" de la migración nueva'
  );
  assert.ok(
    saved.database_schema.includes('public.users'),
    'recalcular no puede perder lo que ya había'
  );
});

// --- Espejo 2: lo que desaparece de los archivos, desaparece del schema ------

test('borrar la migración por el camino normal encoge database_schema', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'c3-encoge';

  const built = await ProjectMemoryService.buildFromFiles(
    projectId,
    baseFiles({ [MIGRATION_X]: MIGRATION_X_SQL })
  );
  assert.ok(
    built.database_schema.includes('reviews_c3'),
    'punto de partida: la migración está en el schema'
  );

  // allFiles ya no la contiene — es exactamente lo que AIOrchestrator pasa tras
  // un borrado: la ruta va en modifiedFilePaths, el contenido ya no está.
  await ProjectMemoryService.updateAfterChange(projectId, [MIGRATION_X], baseFiles());

  const saved = store.rows.get(projectId);
  assert.ok(saved, 'updateAfterChange debe persistir la memoria');
  assert.ok(
    !saved.database_schema.includes('reviews_c3'),
    'la migración borrada debe salir del schema'
  );
  assert.ok(
    saved.database_schema.includes('public.users'),
    'lo que sigue en disco sigue en el schema'
  );
});

// --- Bonus: src/types.ts es parte de la misma intención ----------------------

test('src/types.ts se recalcula con el mismo movimiento', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'c3-types';

  const built = await ProjectMemoryService.buildFromFiles(projectId, baseFiles());
  assert.ok(!built.database_schema.includes('ReviewC3'));

  await ProjectMemoryService.updateAfterChange(
    projectId,
    ['src/types.ts'],
    baseFiles({ 'src/types.ts': TYPES_V2 })
  );

  const saved = store.rows.get(projectId);
  assert.ok(
    saved.database_schema.includes('ReviewC3'),
    'el tipo nuevo debe estar en el schema persistido'
  );
});

// --- Guarda de no-regresión: el registro de componentes sigue igual ----------

test('el recálculo del schema no altera el reindexado de componentes', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'c3-registry';

  await ProjectMemoryService.buildFromFiles(projectId, baseFiles());

  const allFiles = baseFiles({
    'src/components/Header.tsx': 'export function Header() { return null; }\nexport const HeaderBadge = () => null;',
    [MIGRATION_X]: MIGRATION_X_SQL,
  });
  await ProjectMemoryService.updateAfterChange(
    projectId,
    ['src/components/Header.tsx', MIGRATION_X],
    allFiles
  );

  const saved = store.rows.get(projectId);
  const names = saved.component_registry.map((c) => c.name).sort();
  assert.deepEqual(names, ['Header', 'HeaderBadge'], 'el componente se reindexa sin duplicarse');
  assert.ok(
    !saved.component_registry.some((c) => c.path === MIGRATION_X),
    'una migración no es un componente'
  );
});
