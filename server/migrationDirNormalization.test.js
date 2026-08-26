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
  orphanMigrationCandidates,
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

// C-D' — ESTE TEST CAMBIÓ DE SIGNO, y el cambio es el punto.
//
// Afirmaba `assert.deepEqual(persisted, [legacy])`: un .sql preexistente fuera
// de sitio se quedaba donde estaba y sólo se AVISABA. La intención era buena —
// no borrar y recrear a espaldas del usuario— pero fusionaba dos casos que no
// son el mismo, y el segundo dejaba el archivo muerto para siempre: sin
// normalizar, sin [DDL_PROPOSED:], sin botón de aprobación y sin contexto de
// schema, con un aviso que le pedía a la persona recrear a mano lo que la
// máquina sabe recolocar. Un proyecto real (`create_pedidos_c2.sql`) quedó
// exactamente así, y ningún reintento lo sacaba de ahí.
//
// La doctrina, partida donde tocaba: mover un preexistente BIEN ubicado es una
// sorpresa (el intent lo está modificando); mover uno MAL ubicado es la
// reparación. Nadie eligió `src/db/migrations/`.
test('un .sql PREEXISTENTE fuera de sitio SÍ se recupera, y deja de estar misplaced', () => {
  const legacy = 'src/db/migrations/20240101000000_create_orders.sql';
  const existing = new Map([[legacy, 'create table orders();']]);

  const persisted = persistedPaths([legacy], existing, 'database_change');
  assert.notDeepEqual(persisted, [legacy], 'ya no se queda donde estaba');
  assert.ok(isMigrationPath(persisted[0]), 'acaba bajo el prefijo real');
  assert.match(persisted[0], /^supabase\/migrations\/\d{14}_create_orders\.sql$/);
  // El corolario: la guarda de misplaced se queda sin nada que reportar, y la
  // marca de propuesta —que antes salía vacía— ahora sí sale.
  assert.deepEqual(misplacedMigrations(persisted), []);
  assert.equal(
    ddlProposedTelemetry(persisted.filter(isMigrationPath)),
    ` [DDL_PROPOSED:${persisted[0]}]`
  );
});

test('un .sql PREEXISTENTE en su sitio NO se mueve: ahí el intent lo modifica', () => {
  // La mitad de la regla original que sigue viva, y la que impide que la
  // recuperación se convierta en "renombra todo lo que toques": renombrar una
  // migración que ya está donde debe crearía un duplicado y dejaría la vieja
  // huérfana con su contenido antiguo.
  const good = `${MIGRATIONS_DIR}20260824120000_create_orders.sql`;
  const existing = new Map([[good, 'create table orders();']]);

  assert.deepEqual(persistedPaths([good], existing, 'database_change'), [good]);
  assert.equal(
    resolveMigrationTargets([good], existing, NOW, { normalizeDir: true }).size,
    0,
    'mapa vacío = no toques nada'
  );
});

// --- C-G — EL CASO DE PRODUCCIÓN, CON SU NOMBRE ------------------------------
//
// `src/db/migrations/create_pedidos_c2.sql`, proyecto 510afe69. Path literal, sin
// timestamp y bajo la carpeta que el modelo se inventó. Los fixtures que ya
// existían cubrían la forma; este cubre el archivo. Se ancla con su nombre para
// que, si alguien vuelve a estrechar el predicado, falle nombrando al proyecto
// que se quedó sin migración.
const C2 = 'src/db/migrations/create_pedidos_c2.sql';

test('C-G 1 — el path de producción, NUEVO, se normaliza (sin timestamp de origen)', () => {
  const [persisted] = persistedPaths([C2], new Map(), 'database_change');

  assert.ok(isMigrationPath(persisted));
  // El nombre sobrevive entero: sin prefijo de 14 dígitos, splitStamp devuelve
  // el fichero como slug y el timestamp lo pone el cliente.
  assert.match(persisted, /^supabase\/migrations\/\d{14}_create_pedidos_c2\.sql$/);
});

test('C-G 2 — el path de producción, PREEXISTENTE, se recupera', () => {
  // El caso que estaba muerto: la fila ya vivía en forge_files, así que el
  // `taken.has(path)` de antes lo excluía del rename y con él se apagaban la
  // marca, el botón y el contexto de schema. Ningún reintento lo arreglaba.
  const existing = new Map([[C2, 'create table pedidos();']]);
  const targets = resolveMigrationTargets([C2], existing, NOW, { normalizeDir: true });

  assert.equal(targets.size, 1, 'devuelve rename: la recuperación existe');
  assert.match(targets.get(C2), /^supabase\/migrations\/\d{14}_create_pedidos_c2\.sql$/);
  // Y el origen que el orquestador tendrá que vaciar es exactamente la clave.
  assert.deepEqual([...targets.keys()], [C2]);
});

test('C-G 3 — un preexistente BIEN ubicado sigue sin renombrarse', () => {
  const good = `${MIGRATIONS_DIR}20260824120000_create_pedidos.sql`;
  const existing = new Map([[good, 'create table pedidos();']]);

  assert.equal(
    resolveMigrationTargets([good], existing, NOW, { normalizeDir: true }).size,
    0,
    'la regla original intacta: aquí el intent MODIFICA, no mueve'
  );
});

test('C-G 4 — un preexistente fuera de sitio SIN normalizeDir sigue quieto', () => {
  // El gate de doctrina no se abre: fuera de un database_change, un .sql suelto
  // no tiene por qué ser una migración y este módulo no lo decide.
  const existing = new Map([[C2, 'create table pedidos();']]);

  assert.equal(
    resolveMigrationTargets([C2], existing, NOW, { normalizeDir: false }).size,
    0
  );
  assert.equal(resolveMigrationRenames([C2], existing, NOW).size, 0);
  assert.deepEqual(persistedPaths([C2], existing, 'feature'), [C2]);
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

test('BONUS: la normalización cura la ceguera de ProjectMemoryService', () => {
  // ProjectMemoryService.extractDatabaseSchema alimenta el `database_schema`
  // que vuelve al modelo en prompts posteriores, y filtra por EL MISMO prefijo.
  // Una migración fuera de sitio también era invisible ahí: el modelo no veía
  // el schema que él mismo acababa de escribir.
  //
  // C-F — ESTE TEST CAYÓ, Y CAER ERA SU TRABAJO. La versión anterior anclaba
  // la condición LITERAL (`path.startsWith('supabase/migrations/') &&
  // path.endsWith('.sql')`), que era una copia a mano de `isMigrationPath`.
  // Anclar la copia la fijaba: mientras el test exigiera ese texto exacto,
  // deduplicar era imposible sin romperlo. El propio comentario decía que si
  // la condición cambiaba se revisaba el razonamiento en vez de envejecer
  // callado — esto es esa revisión. Lo que se ancla ahora es el CONSUMO del
  // reconocedor único, no su transcripción.
  //
  // El método sigue sin poder importarse desde `node --test` (es TypeScript y
  // es privado), así que lo que se fija es el ACOPLAMIENTO: que
  // ProjectMemoryService importe `isMigrationPath` de migrationPath.js y lo
  // use, más la prueba de que el path normalizado lo satisface y el original
  // no. El mirror de abajo es ahora la función REAL, importada: si el
  // reconocedor se ensancha, este test se entera solo.
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'ProjectMemoryService.ts'),
    'utf8'
  );
  assert.match(
    source,
    /import \{[^}]*\bisMigrationPath\b[^}]*\}\s*from\s*'\.\.\/utils\/migrationPath\.js'/,
    'ProjectMemoryService debe importar el reconocedor, no reimplementarlo'
  );
  assert.match(
    source,
    /if \(isMigrationPath\(path\) \|\| path === 'src\/types\.ts'\)/,
    'extractDatabaseSchema debe filtrar CON isMigrationPath'
  );
  assert.doesNotMatch(
    source,
    /startsWith\('supabase\/migrations\/'\)/,
    'no puede quedar ninguna copia a mano del prefijo en ProjectMemoryService'
  );

  const seenByMemory = isMigrationPath;

  const stray = 'src/db/migrations/20240101000000_create_orders.sql';
  assert.equal(seenByMemory(stray), false, 'antes: el modelo no veía su propio schema');

  const [persisted] = persistedPaths([stray], new Map(), 'database_change');
  assert.equal(seenByMemory(persisted), true, 'después: lo ve, con el MISMO reconocedor');
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

// ---------------------------------------------------------------------------
// C-D'' — LOS HUÉRFANOS ENTRAN AL INPUT, NO SÓLO AL PREDICADO.
//
// C-D' cambió correctamente el predicado de `resolveMigrationTargets`: un .sql
// preexistente fuera de sitio SÍ se recupera. Lo que quedó intacto fue su
// DOMINIO DE ENTRADA. El orquestador le pasa `diffPaths`, que se construye
// iterando `finalFiles` y por tanto sólo contiene lo que el modelo tocó en ESTE
// intent. El huérfano que dejó un intent anterior no está ahí.
//
// El checkpoint en vivo del 2026-08-26 sobre el proyecto 510afe69 lo enseñó sin
// margen de duda: la migración nueva normalizó perfecta y
// `src/db/migrations/create_pedidos_c2.sql` sobrevivió sin entrar JAMÁS a la
// función. La recuperación de C-D' sólo dispara si el modelo reescribe el
// huérfano — y no tiene ningún motivo para hacerlo.
//
// La cirugía es el BARRIDO: los candidatos salen del mapa completo del proyecto
// (estado pre-intent), no del diff. C-D' enseñó al sistema a reparar lo que ve;
// C-D'' le enseña a mirar.
// ---------------------------------------------------------------------------

/**
 * El bucle del orquestador tal como queda tras C-D'': barrido gateado por
 * `database_change`, unión con `diffPaths`, normalización, y persistencia
 * sacando el contenido de `finalFiles` con caída explícita a `files`. Devuelve
 * las ESCRITURAS en orden —una
 * entrada por llamada a notifyFileUpdate, para que un duplicado se vea— y los
 * orígenes vaciados que salen por el puente de delete.
 */
function orchestrate({ files, finalFiles = new Map(), intentType, deletedPaths = [] }) {
  const diffPaths = [];
  for (const [p, content] of finalFiles) {
    if (!files.has(p) || files.get(p) !== content) {
      if (!diffPaths.includes(p)) diffPaths.push(p);
    }
  }

  const sweptOrphans = intentType === 'database_change'
    ? orphanMigrationCandidates(files).filter(
        (p) => !diffPaths.includes(p) && !deletedPaths.includes(p)
      )
    : [];
  const migrationInputPaths = [...diffPaths, ...sweptOrphans];

  const targets = resolveMigrationTargets(migrationInputPaths, files, NOW, {
    normalizeDir: intentType === 'database_change',
  });

  const writes = [];
  const vacated = [];
  for (const p of migrationInputPaths) {
    const content = finalFiles.get(p) ?? files.get(p);
    const target = targets.get(p) ?? p;
    writes.push([target, content]);
    if (target !== p && files.has(p)) vacated.push(p);
  }
  return { writes, vacated, persisted: writes.map(([t]) => t) };
}

test("C-D'' 1 — el huérfano de producción se recupera SIN que el modelo lo toque", () => {
  // El caso de hoy, con su nombre: `create_pedidos_c2.sql` ya vivía en el
  // proyecto y el intent de hoy escribió OTRA migración. Bajo C-D' el huérfano
  // no entraba a la función y sobrevivía intacto; ahora entra por el barrido.
  const files = new Map([
    [C2, 'create table pedidos();'],
    ['src/App.tsx', 'export default App;'],
  ]);
  const finalFiles = new Map([
    ...files,
    [`${MIGRATIONS_DIR}20260826060400_create_clientes.sql`, 'create table clientes();'],
  ]);

  const { writes, vacated, persisted } = orchestrate({
    files,
    finalFiles,
    intentType: 'database_change',
  });

  // El huérfano NO estaba en diffPaths: el modelo no lo tocó.
  assert.ok(!writes.some(([t]) => t === C2), 'no se persiste donde estaba');

  const recovered = writes.find(([t]) => /_create_pedidos_c2\.sql$/.test(t));
  assert.ok(recovered, 'se escribe bajo el prefijo real');
  assert.match(recovered[0], /^supabase\/migrations\/\d{14}_create_pedidos_c2\.sql$/);
  // Y con SU contenido. Ojo con el fixture: `finalFiles` es el mapa COMPLETO
  // del proyecto (el Verifier arranca de `new Map(originalFiles)`), así que el
  // huérfano intacto SIGUE ahí con su contenido original —que es justo por qué
  // no entró a `diffPaths`— y los dos mapas coinciden. Lo que se fija aquí es
  // el contenido, no de cuál de los dos salió.
  assert.equal(recovered[1], 'create table pedidos();');

  // La fila vieja sale por el puente de delete, igual que en C-D'.
  assert.deepEqual(vacated, [C2]);

  // Y el corolario que estaba muerto: ahora la propuesta lo incluye y la guarda
  // de misplaced se queda sin nada que reportar.
  assert.deepEqual(misplacedMigrations(persisted), []);
  assert.match(ddlProposedTelemetry(persisted.filter(isMigrationPath)), /_create_pedidos_c2\.sql/);
});

test("C-D'' 2 — huérfano barrido Y reescrito por el modelo: UNA sola escritura", () => {
  // El dedupe. Si el modelo sí reescribió el huérfano, viene por `diffPaths` y
  // el barrido no debe volver a añadirlo: dos entradas serían dos escrituras, y
  // la segunda pisaría el contenido nuevo con el viejo.
  const files = new Map([[C2, 'create table pedidos();']]);
  const finalFiles = new Map([[C2, 'create table pedidos(id uuid);']]);

  const { writes, vacated } = orchestrate({
    files,
    finalFiles,
    intentType: 'database_change',
  });

  assert.equal(writes.length, 1, 'una entrada, no dos');
  assert.match(writes[0][0], /^supabase\/migrations\/\d{14}_create_pedidos_c2\.sql$/);
  assert.equal(writes[0][1], 'create table pedidos(id uuid);', 'gana finalFiles, no el original');
  assert.deepEqual(vacated, [C2]);
});

test("C-D'' 3 — un .sql fuera del segmento migrations/ no lo barre nadie", () => {
  // La doctrina de 2.2, intacta: `src/queries/reporte.sql` no es residuo de
  // ningún plan, es un archivo que alguien quiso tener ahí, y si es o no una
  // migración no nos toca decidirlo. El barrido cubre el espacio de alucinación
  // documentado, no todo el .sql del proyecto.
  const deliberate = 'src/queries/reporte.sql';
  const files = new Map([[deliberate, 'select * from pedidos;']]);

  assert.deepEqual(orphanMigrationCandidates(files), []);

  const { writes, vacated } = orchestrate({ files, intentType: 'database_change' });
  assert.deepEqual(writes, [], 'no se escribe nada');
  assert.deepEqual(vacated, [], 'y no se vacía nada');

  // Ni por parecido de subcadena: el segmento tiene que ser `migrations/`.
  assert.deepEqual(orphanMigrationCandidates(['src/dbmigrations/x.sql']), []);
  // Las tres formas del espacio de alucinación, en cambio, sí.
  assert.deepEqual(
    orphanMigrationCandidates([
      'src/db/migrations/a.sql',
      'db/migrations/b.sql',
      'migrations/c.sql',
      `${MIGRATIONS_DIR}d.sql`,
    ]),
    ['src/db/migrations/a.sql', 'db/migrations/b.sql', 'migrations/c.sql']
  );
});

test("C-D'' 4 — el gate: fuera de un database_change el huérfano no se toca", () => {
  const files = new Map([[C2, 'create table pedidos();']]);

  const { writes, vacated } = orchestrate({ files, intentType: 'feature' });
  assert.deepEqual(writes, []);
  assert.deepEqual(vacated, []);
});

test("C-D'' — un huérfano que el plan BORRÓ no se resucita", () => {
  // Cinturón, no lógica nueva: si este intent eligió eliminar el .sql, el
  // barrido no puede recolocarlo. `files` es el mapa pre-intent, así que el
  // huérfano sigue ahí cuando se barre.
  const files = new Map([[C2, 'create table pedidos();']]);

  const { writes, vacated } = orchestrate({
    files,
    intentType: 'database_change',
    deletedPaths: [C2],
  });
  assert.deepEqual(writes, []);
  assert.deepEqual(vacated, []);
});

test("C-D'' — la caída a `files` es una GUARDA, y como guarda se fija", () => {
  // Honestidad sobre el mecanismo: hoy esta caída NO se ejerce nunca. El
  // Verifier devuelve siempre el mapa completo del proyecto —`new Map(
  // originalFiles)` de entrada, y cada reparación otra copia entera— así que un
  // huérfano barrido está en `finalFiles` con su contenido original y el primer
  // término del `??` ya acierta. El brief de C-D'' daba por hecho lo contrario
  // ("el bucle escribiría undefined"); la fuente dice que no.
  //
  // La caída se queda igual, porque lo que garantiza es lo que importa: un
  // huérfano se escribe con EL CONTENIDO QUE TIENE, venga del mapa que venga, y
  // nunca con `undefined`. Este test la ejerce con un `finalFiles` que no lo
  // carga —el único mundo en que el `!` de antes habría escrito basura— para
  // que la guarda no se borre por parecer muerta.
  const files = new Map([[C2, 'create table pedidos();']]);
  const finalFiles = new Map([
    [`${MIGRATIONS_DIR}20260826060400_create_clientes.sql`, 'create table clientes();'],
  ]);

  const { writes } = orchestrate({ files, finalFiles, intentType: 'database_change' });

  const recovered = writes.find(([t]) => /_create_pedidos_c2\.sql$/.test(t));
  assert.ok(recovered, 'el huérfano se recupera igual');
  assert.equal(recovered[1], 'create table pedidos();', 'con contenido, no undefined');
  assert.ok(
    writes.every(([, content]) => content !== undefined),
    'ninguna escritura sale con undefined'
  );
});

test("C-D'' — el orquestador barre de verdad: el acoplamiento, anclado", () => {
  // El bucle vive en un método privado de un .ts que `node --test` no puede
  // importar, así que —igual que el BONUS de arriba— lo que se fija es que la
  // fuente siga haciendo las tres cosas que estos tests modelan: barrer `files`
  // (no `diffPaths`), unir, y sacar el contenido del mapa original cuando el
  // huérfano no está en `finalFiles`.
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'services', 'AIOrchestrator.ts'),
    'utf8'
  );

  assert.match(
    source,
    /orphanMigrationCandidates\(files\)/,
    'el barrido mira el mapa COMPLETO del proyecto, no el diff'
  );
  assert.match(
    source,
    /const migrationInputPaths = \[\.\.\.diffPaths, \.\.\.sweptOrphans\]/,
    'y su resultado se UNE a la entrada de la normalización'
  );
  assert.match(
    source,
    /resolveMigrationTargets\(migrationInputPaths, files, Date\.now\(\)/,
    'resolveMigrationTargets recibe la entrada ampliada'
  );
  assert.match(
    source,
    /for \(const path of migrationInputPaths\) \{/,
    'y el bucle de persistencia recorre esa misma lista'
  );
  assert.match(
    source,
    /const content = finalFiles\.get\(path\) \?\? files\.get\(path\)!/,
    'el huérfano barrido saca su contenido del mapa original'
  );
});
