import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// ---------------------------------------------------------------------------
// RECOMPUTE — LA MEMORIA DEL PROYECTO DEJA DE VIVIR EN EL DÍA DEL BOOTSTRAP.
//
// EL FALLO QUE ESTO REPARA:
// `buildFromFiles` calcula tech_stack, design_tokens, route_map y
// code_conventions una sola vez, en el bootstrap. `updateAfterChange` —el único
// camino por el que la memoria se actualiza después— no los tocaba: los
// arrastraba tal cual salieron de `get()` y los volvía a subir en el upsert,
// con `updated_at` fresco. La fila PARECÍA viva y sus cuatro campos eran una
// foto del primer día. Misma anatomía exacta que el bug ya curado de
// `database_schema`, por las cuatro vías que quedaban abiertas:
//
//   - una ruta añadida a App.tsx nunca entraba en route_map;
//   - un token cambiado en index.css nunca entraba en design_tokens;
//   - una dependencia añadida a package.json nunca entraba en tech_stack;
//   - adoptar tailwind, cn() o mover el alias de imports nunca entraba en
//     code_conventions.
//
// El modelo recibía esa foto vieja en cada prompt (formatForPrompt la vuelca
// entera) y escribía contra un proyecto que ya no existía.
//
// LA DOCTRINA QUE ESTO FIJA:
// los cuatro campos son PROYECCIONES PURAS DE LOS ARCHIVOS, no estado
// acumulado: no hay nada en ellos que no esté en el mapa de archivos. Por eso
// se recomputan ENTEROS desde `allFiles` en cada cambio, con las mismas
// funciones que usa `buildFromFiles`. La premisa que lo autoriza está
// verificada en los cuatro call sites: `allFiles` es siempre el mapa COMPLETO
// del proyecto (Implementer arranca de `new Map(files)`, el Verifier de
// `new Map(originalFiles)`, y StudioEngine pasa el estado de useProjectFiles),
// nunca el subconjunto modificado. Recomputar entero es, por tanto, verdad —
// no una apuesta.
//
// De ahí los espejos de abajo: lo que cambia en los archivos cambia en la
// memoria, y lo que desaparece de los archivos desaparece de la memoria.
// Revertir cualquiera de las cuatro líneas rompe su espejo.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = path.join(ROOT, 'src', 'services', 'ProjectMemoryService.ts');

// --- Carga del servicio real -------------------------------------------------
//
// Mismo harness offline que projectMemorySchema.test.js: se compila el servicio
// REAL con esbuild y se sustituye ÚNICAMENTE su frontera de persistencia por
// una tabla en memoria. Lo que se prueba es el código de producción.

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
  const src = `${CODE}\n//${loadCount++}`;
  const url = `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
  const mod = await import(url);
  return { ProjectMemoryService: mod.ProjectMemoryService, store };
}

// --- Fixtures ----------------------------------------------------------------
//
// V1 es el proyecto tal como lo ve el bootstrap. V2 es el MISMO proyecto
// después de un intent: una ruta más, un token más, una dependencia más, y las
// tres convenciones volteadas (tailwind adoptado, cn() en uso, alias movido).

const TSCONFIG_V1 = JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } });
const TSCONFIG_V2 = JSON.stringify({ compilerOptions: { paths: { '~/*': ['./src/*'] } } });

function filesV1() {
  return new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '^19.2.0' } })],
    ['src/index.css', ':root { --brand: #000; }'],
    ['src/App.tsx', '<Route path="/" element={<Home />} />'],
    ['src/pages/Home.tsx', 'export default function Home() { return null; }'],
    ['src/components/Header.tsx', 'export function Header() { return null; }'],
    ['tsconfig.json', TSCONFIG_V1],
  ]);
}

function filesV2() {
  return new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '^19.2.0', zod: '^3.24.0' } })],
    ['src/index.css', ':root { --brand: #000; --accent: #ff0055; }'],
    [
      'src/App.tsx',
      '<Route path="/" element={<Home />} />\n<Route path="/pricing" element={<Pricing />} />',
    ],
    ['src/pages/Home.tsx', 'export default function Home() { return null; }'],
    ['src/pages/Pricing.tsx', 'export default function Pricing() { return null; }'],
    ['src/components/Header.tsx', 'export function Header() { return cn("x"); }'],
    ['tsconfig.json', TSCONFIG_V2],
    ['tailwind.config.ts', 'export default { content: [] };'],
  ]);
}

// --- Espejo 1: route_map ------------------------------------------------------

test('RECOMPUTE: una ruta añadida tras el bootstrap entra en route_map', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-routes';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  assert.deepEqual(
    built.route_map,
    [{ path: '/', component: 'Home' }],
    'premisa: la memoria nace con una sola ruta'
  );

  await ProjectMemoryService.updateAfterChange(projectId, ['src/App.tsx'], filesV2());

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.route_map,
    [
      { path: '/', component: 'Home' },
      { path: '/pricing', component: 'Pricing' },
    ],
    'la ruta nueva debe estar en el route_map persistido'
  );
});

test('RECOMPUTE: una ruta borrada de App.tsx sale de route_map', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-routes-shrink';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV2());
  assert.equal(built.route_map.length, 2, 'punto de partida: dos rutas');

  // Vuelta a V1: App.tsx ya no declara /pricing.
  await ProjectMemoryService.updateAfterChange(projectId, ['src/App.tsx'], filesV1());

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.route_map,
    [{ path: '/', component: 'Home' }],
    'la ruta que ya no está en los archivos no puede seguir en la memoria'
  );
});

// --- Espejo 2: design_tokens --------------------------------------------------

test('RECOMPUTE: un token nuevo en index.css entra en design_tokens', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-tokens';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  assert.deepEqual(built.design_tokens, { '--brand': '#000' }, 'premisa: un solo token');

  await ProjectMemoryService.updateAfterChange(projectId, ['src/index.css'], filesV2());

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.design_tokens,
    { '--brand': '#000', '--accent': '#ff0055' },
    'el token nuevo debe estar en los design_tokens persistidos'
  );
});

// --- Espejo 3: tech_stack -----------------------------------------------------

test('RECOMPUTE: una dependencia añadida a package.json entra en tech_stack', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-stack';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  assert.ok(!('zod' in built.tech_stack), 'guarda: la memoria NO nace sabiendo de zod');

  await ProjectMemoryService.updateAfterChange(projectId, ['package.json'], filesV2());

  const saved = store.rows.get(projectId);
  assert.equal(saved.tech_stack.zod, '^3.24.0', 'la dependencia nueva debe estar en tech_stack');
  assert.equal(saved.tech_stack.react, '^19.2.0', 'recalcular no puede perder lo que ya había');
});

// --- Espejo 4: code_conventions ----------------------------------------------

test('RECOMPUTE: adoptar tailwind, cn() y mover el alias entra en code_conventions', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-conventions';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  assert.deepEqual(
    built.code_conventions,
    { uses_tailwind: false, uses_cn: false, import_alias: '@' },
    'premisa: el proyecto nace sin tailwind, sin cn() y con alias @'
  );

  await ProjectMemoryService.updateAfterChange(
    projectId,
    ['tailwind.config.ts', 'src/components/Header.tsx', 'tsconfig.json'],
    filesV2()
  );

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.code_conventions,
    { uses_tailwind: true, uses_cn: true, import_alias: '~' },
    'las tres convenciones deben reflejar el estado NUEVO de los archivos'
  );
});

// --- Los cuatro a la vez, que es como ocurre en producción --------------------

test('RECOMPUTE: un solo updateAfterChange mueve los cuatro campos a la vez', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-todos';

  await ProjectMemoryService.buildFromFiles(projectId, filesV1());

  // Un intent real no enumera todo lo que tocó de forma exhaustiva; el mapa sí
  // es completo. Por eso se pasa UN solo path modificado y aun así los cuatro
  // campos deben cuadrar con V2: la lista no decide nada, el mapa manda.
  await ProjectMemoryService.updateAfterChange(projectId, ['src/App.tsx'], filesV2());

  const saved = store.rows.get(projectId);
  assert.equal(saved.route_map.length, 2, 'route_map recomputado');
  assert.ok('--accent' in saved.design_tokens, 'design_tokens recomputado');
  assert.ok('zod' in saved.tech_stack, 'tech_stack recomputado');
  assert.equal(saved.code_conventions.uses_tailwind, true, 'code_conventions recomputado');
  assert.equal(saved.code_conventions.import_alias, '~', 'code_conventions recomputado entero');
});

// --- component_registry: el extractor canónico, no la copia -------------------

test('RECOMPUTE: un componente nuevo en un archivo modificado aparece en el registro', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-registry-gana';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  assert.deepEqual(
    built.component_registry.map((c) => c.name).sort(),
    ['Header', 'Home'],
    'premisa: dos componentes en el bootstrap'
  );

  const allFiles = filesV1();
  allFiles.set(
    'src/components/Header.tsx',
    'export function Header() { return null; }\nexport const HeaderBadge = () => null;'
  );
  await ProjectMemoryService.updateAfterChange(
    projectId,
    ['src/components/Header.tsx'],
    allFiles
  );

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.component_registry.map((c) => c.name).sort(),
    ['Header', 'HeaderBadge', 'Home'],
    'el componente nuevo entra y ninguno se duplica'
  );
});

test('RECOMPUTE: un componente borrado del archivo sale del registro', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-registry-encoge';

  const v1 = filesV1();
  v1.set(
    'src/components/Header.tsx',
    'export function Header() { return null; }\nexport const HeaderBadge = () => null;'
  );
  const built = await ProjectMemoryService.buildFromFiles(projectId, v1);
  assert.ok(
    built.component_registry.some((c) => c.name === 'HeaderBadge'),
    'punto de partida: HeaderBadge está en el registro'
  );

  // El archivo sigue existiendo; el export de dentro ya no.
  await ProjectMemoryService.updateAfterChange(
    projectId,
    ['src/components/Header.tsx'],
    filesV1()
  );

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.component_registry.map((c) => c.name).sort(),
    ['Header', 'Home'],
    'el export que ya no está en el archivo no puede seguir en el registro'
  );
});

test('RECOMPUTE: un archivo que desaparece del mapa sale del registro aunque nadie lo nombre', async () => {
  // ÉSTE es el detector de mutación del cambio de component_registry: bajo el
  // reindexado incremental viejo, una entrada sólo salía del registro si su
  // path venía en `modifiedFilePaths`. Un archivo ausente de `allFiles` y NO
  // enumerado sobrevivía en la memoria para siempre. Con el extractor canónico
  // sobre el mapa completo, sale por ausencia — que es la única fuente de
  // verdad que hay.
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-registry-fantasma';

  const built = await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  assert.ok(
    built.component_registry.some((c) => c.path === 'src/pages/Home.tsx'),
    'punto de partida: Home está en el registro'
  );

  const allFiles = filesV1();
  allFiles.delete('src/pages/Home.tsx');
  // La lista NO menciona Home.tsx: el mapa es la única señal de su ausencia.
  await ProjectMemoryService.updateAfterChange(
    projectId,
    ['src/components/Header.tsx'],
    allFiles
  );

  const saved = store.rows.get(projectId);
  assert.ok(
    !saved.component_registry.some((c) => c.path === 'src/pages/Home.tsx'),
    'un archivo que ya no está en el proyecto no puede seguir en el registro'
  );
  assert.deepEqual(
    saved.component_registry.map((c) => c.name),
    ['Header'],
    'y lo que sigue en disco sigue en el registro'
  );
});

test('RECOMPUTE: llamar dos veces no duplica el registro', async () => {
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-registry-idempotente';

  await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  await ProjectMemoryService.updateAfterChange(projectId, ['src/App.tsx'], filesV1());
  await ProjectMemoryService.updateAfterChange(projectId, ['src/App.tsx'], filesV1());

  const saved = store.rows.get(projectId);
  assert.deepEqual(
    saved.component_registry.map((c) => c.name).sort(),
    ['Header', 'Home'],
    'recomputar entero es idempotente por construcción'
  );
});

// --- Lo que NO se recomputa: el historial de acciones -------------------------

test('RECOMPUTE: last_10_actions NO es una proyección de los archivos y sobrevive', async () => {
  // La frontera de la doctrina, escrita como aserción. Los cinco campos que se
  // recomputan salen enteros de los archivos; `last_10_actions` es estado
  // acumulado que NO vive en ellos, así que recomputar no puede borrarlo. Si
  // alguien "unifica" y lo mete en el barrido, este test cae.
  const { ProjectMemoryService, store } = await loadService();
  const projectId = 'rc-acciones';

  await ProjectMemoryService.buildFromFiles(projectId, filesV1());
  await ProjectMemoryService.recordAction(projectId, {
    action: 'añade la página de precios',
    outcome: 'success',
  });

  await ProjectMemoryService.updateAfterChange(projectId, ['src/App.tsx'], filesV2());

  const saved = store.rows.get(projectId);
  assert.equal(saved.last_10_actions.length, 1, 'la acción registrada sobrevive al recompute');
  assert.equal(saved.last_10_actions[0].action, 'añade la página de precios');
});

// --- Ancla en la fuente: un solo indexador, cinco campos recomputados --------

test('RECOMPUTE: el indexador de componentes es UNO, anclado en la fuente', () => {
  const source = fs.readFileSync(SERVICE, 'utf8');

  assert.match(
    source,
    /existing\.component_registry = this\.extractComponents\(allFiles\);/,
    'updateAfterChange USA el extractor canónico — no lo reimplementa'
  );
  // La copia literal que vivía aquí: el mismo regex de extractComponents,
  // escrito a mano por segunda vez. Que aparezca UNA sola vez en el archivo es
  // exactamente la propiedad "un solo indexador".
  const exportRegexCopies = source.split('export\\s+(?:default\\s+)?(?:function|const|class)').length - 1;
  assert.equal(
    exportRegexCopies,
    1,
    'el regex de exports vive en extractComponents y en ningún otro sitio'
  );
});

test('RECOMPUTE: los cuatro campos congelados se recomputan, anclado en la fuente', () => {
  const source = fs.readFileSync(SERVICE, 'utf8');

  for (const [field, extractor] of [
    ['tech_stack', 'extractTechStack'],
    ['design_tokens', 'extractDesignTokens'],
    ['route_map', 'extractRoutes'],
    ['code_conventions', 'extractConventions'],
  ]) {
    assert.match(
      source,
      new RegExp(`existing\\.${field} = this\\.${extractor}\\(allFiles\\);`),
      `${field} se recomputa entero desde allFiles con ${extractor}`
    );
  }
});
