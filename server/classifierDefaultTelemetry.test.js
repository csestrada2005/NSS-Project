import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// ---------------------------------------------------------------------------
// IntentClassifier.classifierDefault — cuál de los cuatro defaults disparó.
//
// EL AGUJERO QUE CIERRA
// ---------------------
// classify() tiene cuatro caminos que devuelven el default, y los cuatro
// devolvían el MISMO objeto: DEFAULT_INTENT. Mismo type ('modify_existing'),
// mismo risk ('medium'), mismo reasoning literal. Desde el Intent retornado era
// imposible saber si hubo un error de API, un type fuera de la unión, un risk
// ausente o una excepción — y era igual de imposible distinguir cualquiera de
// los cuatro de un 'modify_existing' clasificado de verdad. La única señal
// vivía en console.warn, y el camino de risk ausente ni siquiera la emitía.
//
// El marcador viaja hasta la columna classifier_default de forge_intent_log
// (NULL = clasificación normal), así que lo que este test fija es el primer
// eslabón de esa cadena: que cada camino se marque con SU literal y que el
// camino de éxito no se marque en absoluto.
//
// POR QUÉ ESTE TEST SÍ IMPORTA EL MÓDULO (y sus vecinos leen la fuente)
// ---------------------------------------------------------------------
// intentValidTypes.test.js y intentLogSingleWriter.test.js assertan sobre el
// TEXTO de IntentClassifier.ts porque lo que fijan es un literal escrito. Aquí
// no: lo que hay que comprobar es qué objeto SALE de classify() por cada rama,
// y eso sólo lo dice ejecutarla. Se usa el mismo montaje que
// scripts/classifierHarness.mjs — bundle en memoria con esbuild (write:false),
// import por data: URL, './PlatformService' resuelto a un stub — así que corre
// el fuente real, sin copia ni reescritura.
//
// DIFERENCIA CON EL HARNESS: allí el stub llama de verdad a api.anthropic.com.
// Aquí NO SALE NADA A LA RED. El stub devuelve respuestas fabricadas en el
// propio test, una por rama. Cero rutas a créditos, a DB o a /api/chat-forge:
// callForgeChat es lo único que el stub implementa, y cualquier otro método de
// platformService lanza si se llegara a tocar.
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const ENTRY_TS = path.join(REPO_ROOT, 'src/services/IntentClassifier.ts');

/** Centinela literal de DEFAULT_INTENT (IntentClassifier.ts:27-35). */
const DEFAULT_REASONING = 'Could not classify intent; using safe default.';

// ---------------------------------------------------------------------------
// Transporte fabricado. `next` es lo que la siguiente llamada a callForgeChat
// devolverá: o un cuerpo que se sirve como .json(), o una instrucción de fallo.
// ---------------------------------------------------------------------------

const transport = {
  next: null,
  calls: 0,
  respondWith(body) {
    this.next = { kind: 'body', body };
  },
  /** El .json() de la respuesta rechaza — no hay cuerpo que parsear. */
  failJson(message) {
    this.next = { kind: 'json-throws', message };
  },
  /** callForgeChat lanza — fallo de transporte antes de haber respuesta. */
  failTransport(message) {
    this.next = { kind: 'throws', message };
  },
  async send() {
    this.calls++;
    const plan = this.next;
    assert.ok(plan, 'el test debe fijar una respuesta antes de invocar classify()');
    if (plan.kind === 'throws') throw new Error(plan.message);
    if (plan.kind === 'json-throws') {
      return { json: async () => { throw new Error(plan.message); } };
    }
    return { json: async () => plan.body };
  },
};

globalThis.__CLASSIFIER_DEFAULT_TEST_TRANSPORT__ = transport;

const stubPlatformService = {
  name: 'stub-platform-service',
  setup(build) {
    build.onResolve({ filter: /(^|\/)PlatformService$/ }, () => ({
      path: 'stub:PlatformService',
      namespace: 'classifier-default-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'classifier-default-stub' }, () => ({
      contents: `
        const outOfScope = (name) => () => {
          throw new Error(
            '[classifierDefaultTelemetry] platformService.' + name + ' fuera de ' +
            'alcance: este test sólo permite callForgeChat, y aun ésa no sale a ' +
            'la red. Cualquier otra ruta implicaría auth de plataforma, créditos o DB.'
          );
        };
        export const platformService = {
          async callForgeChat(body, signal) {
            return globalThis.__CLASSIFIER_DEFAULT_TEST_TRANSPORT__.send(body, signal);
          },
          beginIntent: outOfScope('beginIntent'),
          setIntentType: outOfScope('setIntentType'),
          getForgeIntentHeaders: outOfScope('getForgeIntentHeaders'),
          closeIntent: outOfScope('closeIntent'),
          callChat: outOfScope('callChat'),
          searchImages: outOfScope('searchImages'),
          checkPlatformServices: outOfScope('checkPlatformServices'),
        };
      `,
      loader: 'js',
      resolveDir: REPO_ROOT,
    }));
  },
};

let IntentClassifier;

before(async () => {
  const result = await esbuild.build({
    entryPoints: [ENTRY_TS],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'silent',
    plugins: [stubPlatformService],
  });
  const mod = await import(
    'data:text/javascript,' + encodeURIComponent(result.outputFiles[0].text)
  );
  IntentClassifier = mod.IntentClassifier;
});

// ---------------------------------------------------------------------------
// Fixture de proyecto. classify() sólo lee component_registry (primeros 20) y
// route_map; el resto no entra en el prompt. Ninguna de las aserciones de abajo
// depende del contenido — la respuesta la fija el transporte, no el modelo.
// ---------------------------------------------------------------------------

const PROJECT_MEMORY = Object.freeze({
  project_id: 'classifier-default-telemetry',
  component_registry: [
    { name: 'Index', path: 'src/pages/Index.tsx' },
    { name: 'Navbar', path: 'src/components/layout/Navbar.tsx' },
  ],
  route_map: [{ path: '/', component: 'Index' }],
});

/** Envuelve un objeto como lo haría Haiku: un content block de texto. */
const asHaikuText = (text) => ({ content: [{ type: 'text', text }] });

/** Respuesta bien formada del modelo. */
const asHaikuJson = (obj) => asHaikuText(JSON.stringify(obj));

const classify = (prompt = 'add a contact form') =>
  IntentClassifier.classify(prompt, PROJECT_MEMORY, []);

/** Todo default debe seguir siendo el DEFAULT_INTENT de siempre. */
function assertIsDefaultIntent(intent) {
  assert.equal(intent.type, 'modify_existing');
  assert.equal(intent.risk, 'medium');
  assert.equal(intent.reasoning, DEFAULT_REASONING);
  assert.deepEqual(intent.affected_files, []);
  assert.equal(intent.needs_new_files, false);
}

// ---------------------------------------------------------------------------
// Guarda del propio test: si el montaje se rompiera, todo lo de abajo pasaría
// en vacío o por el motivo equivocado.
// ---------------------------------------------------------------------------

test('el montaje carga el clasificador real y el transporte está stubbeado', () => {
  assert.equal(typeof IntentClassifier?.classify, 'function');
  const src = fs.readFileSync(ENTRY_TS, 'utf8');
  assert.match(src, /const DEFAULT_INTENT: Intent = \{/);
  assert.ok(
    src.includes(`reasoning: '${DEFAULT_REASONING}'`),
    'el centinela DEFAULT_REASONING dejó de coincidir con DEFAULT_INTENT'
  );
});

// ---------------------------------------------------------------------------
// Los cuatro caminos de default, uno por test.
// ---------------------------------------------------------------------------

test("camino 1 — error de API marca classifierDefault 'api_error'", async () => {
  transport.respondWith({ error: { type: 'overloaded_error', message: 'Overloaded' } });
  const intent = await classify();

  assert.equal(intent.classifierDefault, 'api_error');
  assertIsDefaultIntent(intent);
});

test("camino 2 — type fuera de la unión marca classifierDefault 'invalid_type'", async () => {
  // 'provision_database' es el fantasma de intentValidTypes.test.js: suena a lo
  // que dispara una migración y no está en la unión.
  transport.respondWith(asHaikuJson({ type: 'provision_database', risk: 'high' }));
  const intent = await classify('add a table called control_cd');

  assert.equal(intent.classifierDefault, 'invalid_type');
  assertIsDefaultIntent(intent);
});

test("camino 2b — type ausente también marca 'invalid_type'", async () => {
  // Misma rama, la otra mitad de su condición (`!parsed.type`). Aquí entra
  // además el caso de texto sin JSON: extractJson devuelve '{}' en vez de
  // lanzar, así que un cuerpo vacío cae por type ausente y NO por el catch.
  transport.respondWith(asHaikuText('no hay JSON en esta respuesta'));
  const intent = await classify();

  assert.equal(intent.classifierDefault, 'invalid_type');
  assertIsDefaultIntent(intent);
});

test("camino 3 — risk ausente marca classifierDefault 'missing_risk'", async () => {
  // El único camino que era MUDO: no emitía console.warn. Un type legítimo
  // llegaba, la respuesta se descartaba entera y no quedaba rastro de por qué.
  transport.respondWith(asHaikuJson({ type: 'fix_bug', affected_files: ['src/App.tsx'] }));
  const intent = await classify('fix the broken image');

  assert.equal(intent.classifierDefault, 'missing_risk');
  assertIsDefaultIntent(intent);
  assert.notEqual(
    intent.type,
    'fix_bug',
    'la respuesta se descarta entera: el marcador no debe hacer creer que se conservó algo'
  );
});

test("camino 4 — excepción marca classifierDefault 'parse_error'", async () => {
  // JSON malformado DENTRO de un fence: extractJson devuelve el contenido del
  // fence tal cual y JSON.parse lanza. Es la vía real al catch, no un atajo.
  transport.respondWith(asHaikuText('```json\n{ "type": "fix_bug", risk: ,, }\n```'));
  const intent = await classify();

  assert.equal(intent.classifierDefault, 'parse_error');
  assertIsDefaultIntent(intent);
});

test("camino 4b — fallo de transporte y de .json() también son 'parse_error'", async () => {
  // El mismo catch cubre las tres formas de excepción. Se fijan las otras dos
  // para que el marcador no dependa de POR DÓNDE entró al catch.
  transport.failTransport('network down');
  const fromTransport = await classify();
  assert.equal(fromTransport.classifierDefault, 'parse_error');
  assertIsDefaultIntent(fromTransport);

  transport.failJson('Unexpected end of JSON input');
  const fromJson = await classify();
  assert.equal(fromJson.classifierDefault, 'parse_error');
  assertIsDefaultIntent(fromJson);
});

// ---------------------------------------------------------------------------
// El quinto caso: éxito. Sin él, un `classifierDefault` puesto siempre pasaría
// los cuatro tests de arriba y la columna quedaría igual de ciega que antes.
// ---------------------------------------------------------------------------

test('camino de éxito — classifierDefault queda undefined', async () => {
  transport.respondWith(asHaikuJson({
    type: 'style_change',
    affected_files: ['src/components/layout/Navbar.tsx'],
    needs_new_files: false,
    risk: 'low',
    reasoning: 'Purely visual tweak to the navbar.',
    requiredPatternIds: [],
    domain: 'ui',
  }));
  const intent = await classify('make all the buttons rounded and blue');

  assert.equal(
    intent.classifierDefault,
    undefined,
    'una clasificación normal no debe marcarse: NULL en classifier_default es lo que la distingue'
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(intent, 'classifierDefault'),
    'el path de éxito no debe siquiera escribir la clave'
  );
  assert.equal(intent.type, 'style_change');
  assert.equal(intent.risk, 'low');
  assert.equal(intent.reasoning, 'Purely visual tweak to the navbar.');
  assert.notEqual(intent.reasoning, DEFAULT_REASONING);
});

test("un 'modify_existing' legítimo ya no se confunde con un default", async () => {
  // La razón de ser de la columna: el default ES un 'modify_existing' de riesgo
  // medium. Antes los dos eran el mismo objeto salvo por el reasoning, que el
  // path de éxito puede dejar en '' si el modelo lo omite — y entonces ni eso
  // distinguía. El marcador sí.
  transport.respondWith(asHaikuJson({ type: 'modify_existing', risk: 'medium' }));
  const legit = await classify('update the footer');

  assert.equal(legit.type, 'modify_existing');
  assert.equal(legit.risk, 'medium');
  assert.equal(legit.classifierDefault, undefined);

  transport.respondWith({ error: { message: 'boom' } });
  const defaulted = await classify('update the footer');

  assert.equal(defaulted.type, legit.type);
  assert.equal(defaulted.risk, legit.risk);
  assert.equal(defaulted.classifierDefault, 'api_error');
});

test('el transporte fabricado se usó y nunca salió a la red', () => {
  assert.ok(transport.calls > 0, 'ningún test llegó a invocar callForgeChat');
});
