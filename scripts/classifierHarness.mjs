/**
 * classifierHarness.mjs — batería de clasificación aislada sobre
 * IntentClassifier.classify (Haiku). SOLO LECTURA: no escribe archivos, ni DB,
 * ni telemetría, ni toca /api/chat-forge (y por tanto tampoco el contador de
 * créditos ni forge_intent_log).
 *
 * ---------------------------------------------------------------------------
 * QUÉ ES REAL Y QUÉ ESTÁ SUSTITUIDO
 * ---------------------------------------------------------------------------
 * REAL (se bundlea el fuente src/services/IntentClassifier.ts tal cual, en
 * memoria, con esbuild — nada se lee de una copia ni se reescribe aquí):
 *   - el systemPrompt completo, incluida la sección INTENT TYPE NOTES
 *   - PATTERN_SUMMARY de src/services/patterns/registry.ts
 *   - el userMessage (COMPONENT REGISTRY / ROUTES / RECENT CHAT HISTORY / USER PROMPT)
 *   - extractJson, VALID_TYPES, DEFAULT_INTENT y el normalizado de la respuesta
 *   - el body exacto: model 'claude-haiku-4-5-20251001', max_tokens 768
 *
 * SUSTITUIDO — únicamente el transporte. El módulo './PlatformService' se
 * resuelve a un stub. El real hace fetch('/api/chat-forge') con URL relativa,
 * JWT de Supabase, `sonner` y `window.dispatchEvent`: sólo funciona en el
 * navegador, y además es la puerta por la que el servidor acumula tokens y
 * cobra (server.js:623-639, activado por la cabecera x-forge-intent-id que
 * emite beginIntent(); el clasificador nunca la emite — la emite AIOrchestrator).
 * El stub manda el MISMO body a https://api.anthropic.com/v1/messages con las
 * mismas cabeceras que usa server.js:578-591 al reenviar. Resultado: misma
 * llamada upstream, sin auth de plataforma, sin cobro, sin DB.
 *
 * Se usa fetch crudo y no el SDK @anthropic-ai/sdk a propósito: el stub debe
 * ser un pass-through byte a byte del objeto que construye classify(), igual
 * que el proxy al que reemplaza. Reconstruir el body con el SDK introduciría
 * divergencia justo en lo que se está midiendo.
 *
 * ---------------------------------------------------------------------------
 * DETECCIÓN DE ERROR (requisito 6)
 * ---------------------------------------------------------------------------
 * classify() traga toda excepción (catch en IntentClassifier.ts:128) y devuelve
 * DEFAULT_INTENT, cuyo type es 'modify_existing'. Un fallo de Haiku es por tanto
 * indistinguible de un 'modify_existing' legítimo si sólo se mira el tipo. Aquí
 * se marca ERROR por dos vías independientes:
 *   1. estado del transporte: excepción de red o HTTP != 2xx
 *   2. centinela exacto de DEFAULT_INTENT (type+risk+reasoning)
 * Un ERROR se registra y la batería continúa; nunca aborta.
 *
 * EJECUCIÓN:  node scripts/classifierHarness.mjs
 * (requiere ANTHROPIC_API_KEY en el entorno, o en un .env de la raíz)
 */

import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const ENTRY_TS = path.join(REPO_ROOT, 'src/services/IntentClassifier.ts');

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';       // idéntica a server.js:582
const REPS = 3;                               // 3 invocaciones independientes por sonda
const DELAY_MS = Number(process.env.HARNESS_DELAY_MS ?? 0); // pausa opcional entre llamadas

/** Centinela literal de DEFAULT_INTENT (IntentClassifier.ts:27-35). */
const DEFAULT_REASONING = 'Could not classify intent; using safe default.';

/** Los 8 literales de la unión Intent['type'] (IntentClassifier.ts:10-18). */
const UNION_TYPES = [
  'new_feature', 'modify_existing', 'fix_bug', 'style_change',
  'add_page', 'database_change', 'refactor', 'question',
];

// ---------------------------------------------------------------------------
// Las 18 sondas, con su clase esperada. El guard de preflight sigue activo:
// rechaza placeholders sobrantes, expected fuera de la unión Intent['type'] y
// cualquier recuento distinto de 18, antes de gastar una sola llamada a Haiku.
// ---------------------------------------------------------------------------

const PROBES = [
  { id: 'F1', prompt: 'add a contact form to the page', expected: 'new_feature' },
  { id: 'F2', prompt: 'how do I add a contact form', expected: 'question' },
  { id: 'F3', prompt: 'can you add a testimonials section?', expected: 'new_feature' },
  { id: 'F4', prompt: 'add a table for customer reviews', expected: 'database_change' },
  { id: 'F5', prompt: 'add a customer reviews section to the landing page', expected: 'new_feature' },
  { id: 'F6', prompt: 'what tables does my database have?', expected: 'question' },
  { id: 'K1', prompt: 'A simple landing page for a bakery', expected: 'new_feature' },
  { id: 'K2', prompt: 'Add a table called control_cd with columns id and note', expected: 'database_change' },
  { id: 'M1', prompt: 'change the hero headline to "Fresh bread daily"', expected: 'modify_existing' },
  { id: 'M2', prompt: 'can you update the footer to show our opening hours?', expected: 'modify_existing' },
  { id: 'B1', prompt: 'the contact form doesn\'t submit anything when I click send, fix it', expected: 'fix_bug' },
  { id: 'B2', prompt: 'fix the broken image on the homepage', expected: 'fix_bug' },
  { id: 'S1', prompt: 'make all the buttons rounded and blue', expected: 'style_change' },
  { id: 'S2', prompt: 'change the color palette to warm earth tones', expected: 'style_change' },
  { id: 'P1', prompt: 'add an about us page', expected: 'add_page' },
  { id: 'P2', prompt: 'create a new menu page and link it from the navbar', expected: 'add_page' },
  { id: 'R1', prompt: 'refactor the Navbar into smaller components without changing how it looks', expected: 'refactor' },
  { id: 'R2', prompt: 'clean up the duplicated code in the section components', expected: 'refactor' },
];

// ---------------------------------------------------------------------------
// CONTEXTO DE PROYECTO — constante fija, idéntica para las 18 sondas y para
// ambas olas.
//
// classify() sólo lee DOS campos de ProjectMemory (IntentClassifier.ts:48-55):
// component_registry (primeros 20, como "Nombre (ruta)") y route_map (como
// "ruta → Componente"). El resto de ProjectMemory (tech_stack, design_tokens,
// database_schema, code_conventions, last_10_actions...) NO entra en el prompt;
// se incluye igualmente para que el objeto siga siendo un ProjectMemory válido
// si algún día se tipa el harness.
//
// POR QUÉ ESTA CONSTANTE Y NO OTRA:
//   - No vacía: con registry y rutas vacías el prompt describe un proyecto
//     inexistente y sesga hacia new_feature / add_page en cualquier sonda que
//     mencione algo existente. Se quiere medir el clasificador, no ese sesgo.
//   - Coherente con las sondas, a propósito: es el esqueleto de una landing de
//     panadería (Layout/Navbar/Footer, Index, secciones hero/productos/contacto,
//     una sola ruta '/'). Varias sondas se apoyan en que esos componentes
//     EXISTAN: R1 refactoriza el Navbar, M1 toca el titular del hero, M2 el
//     footer. Con un registry genérico esas expectativas serían injustas — el
//     clasificador podría responder new_feature con razón, y estaríamos midiendo
//     el fixture en vez del prompt.
//   - Consecuencia asumida: hay solapamiento entre el registry y el vocabulario
//     de algunas sondas. El caso vivo es F1 ('add a contact form') con expected
//     new_feature existiendo ya ContactSection — un fallo ahí puede ser
//     ambigüedad del fixture y no del clasificador. Léase con eso en mente.
//   - Congelada: es la misma constante en las 18 sondas y en las dos olas, así
//     que cualquier diferencia entre olas es del prompt del clasificador, no
//     del contexto.
//
// chatHistory va vacío ([]) a propósito: con historial, `recentHistory`
// contaminaría cada sonda con las anteriores y las 3 repeticiones dejarían de
// ser independientes.
// ---------------------------------------------------------------------------

const PROJECT_MEMORY = Object.freeze({
  project_id: 'harness-fixed-context',
  tech_stack: { react: '^19.2.0', 'react-router-dom': '^7.13.1' },
  design_tokens: {},
  component_registry: [
    { name: 'Layout',          path: 'src/components/layout/Layout.tsx' },
    { name: 'Navbar',          path: 'src/components/layout/Navbar.tsx' },
    { name: 'Footer',          path: 'src/components/layout/Footer.tsx' },
    { name: 'Index',           path: 'src/pages/Index.tsx' },
    { name: 'NotFound',        path: 'src/pages/NotFound.tsx' },
    { name: 'HeroSection',     path: 'src/components/sections/HeroSection.tsx' },
    { name: 'ProductsSection', path: 'src/components/sections/ProductsSection.tsx' },
    { name: 'ContactSection',  path: 'src/components/sections/ContactSection.tsx' },
  ],
  route_map: [
    { path: '/', component: 'Index' },
  ],
  database_schema: '',
  code_conventions: {},
  last_10_actions: [],
  updated_at: '1970-01-01T00:00:00.000Z',
});

const CHAT_HISTORY = [];

// ---------------------------------------------------------------------------
// Transporte: sustituto de platformService.callForgeChat.
// Estado a nivel de módulo — la batería es estrictamente secuencial, así que
// lastStatus/lastError describen siempre la invocación en curso.
// ---------------------------------------------------------------------------

const transport = {
  apiKey: null,
  lastStatus: null,
  lastError: null,
  reset() {
    this.lastStatus = null;
    this.lastError = null;
  },
  async send(body, signal) {
    let res;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),   // pass-through: el body es el de classify()
        signal,
      });
    } catch (err) {
      // Fallo de red: se registra y se relanza. classify() lo captura y
      // devuelve DEFAULT_INTENT; el harness ya sabe que fue transporte.
      this.lastError = `network: ${err?.message ?? String(err)}`;
      throw err;
    }
    this.lastStatus = res.status;
    if (!res.ok) this.lastError = `http ${res.status}`;
    return res;
  },
};

globalThis.__HARNESS_TRANSPORT__ = transport;

// ---------------------------------------------------------------------------
// Carga del clasificador real: bundle en memoria (write:false) e import por
// data: URL. Nada toca el disco — ni un archivo temporal.
// ---------------------------------------------------------------------------

const stubPlatformService = {
  name: 'stub-platform-service',
  setup(build) {
    build.onResolve({ filter: /(^|\/)PlatformService$/ }, () => ({
      path: 'stub:PlatformService',
      namespace: 'harness-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'harness-stub' }, () => ({
      contents: `
        const notInHarness = (name) => () => {
          throw new Error(
            '[harness] platformService.' + name + ' fuera de alcance: el harness ' +
            'sólo permite callForgeChat. Cualquier otra ruta implicaría auth de ' +
            'plataforma, créditos o DB.'
          );
        };
        export const platformService = {
          async callForgeChat(body, signal) {
            return globalThis.__HARNESS_TRANSPORT__.send(body, signal);
          },
          beginIntent: notInHarness('beginIntent'),
          setIntentType: notInHarness('setIntentType'),
          getForgeIntentHeaders: notInHarness('getForgeIntentHeaders'),
          closeIntent: notInHarness('closeIntent'),
          callChat: notInHarness('callChat'),
          searchImages: notInHarness('searchImages'),
          checkPlatformServices: notInHarness('checkPlatformServices'),
        };
      `,
      loader: 'js',
      resolveDir: REPO_ROOT,
    }));
  },
};

async function loadClassifier() {
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
  const code = result.outputFiles[0].text;
  const mod = await import('data:text/javascript,' + encodeURIComponent(code));
  return mod.IntentClassifier;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Clase de una invocación: un literal de la unión, o 'ERROR'. */
function classifyOutcome(intent) {
  if (transport.lastError) {
    return { cls: 'ERROR', detail: transport.lastError };
  }
  if (!intent || typeof intent.type !== 'string') {
    return { cls: 'ERROR', detail: 'respuesta sin type' };
  }
  const isDefaultSentinel =
    intent.type === 'modify_existing' &&
    intent.risk === 'medium' &&
    intent.reasoning === DEFAULT_REASONING;
  if (isDefaultSentinel) {
    return { cls: 'ERROR', detail: 'DEFAULT_INTENT (classify() tragó un fallo)' };
  }
  return { cls: intent.type, detail: null };
}

/** Mayoría simple sobre 3 clases; 'NONE' si las tres difieren. */
function majorityOf(classes) {
  const counts = new Map();
  for (const c of classes) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN) { best = c; bestN = n; }
  }
  return bestN >= 2 ? best : 'NONE';
}

function pad(s, n) {
  const str = String(s);
  return str.length >= n ? str : str + ' '.repeat(n - str.length);
}

// ---------------------------------------------------------------------------
// Guards previos — fallan ANTES de gastar una sola llamada a Haiku
// ---------------------------------------------------------------------------

function preflight() {
  const problems = [];

  const pending = PROBES.filter(
    (p) => p.prompt.startsWith('<<PENDING') || p.expected.startsWith('<<PENDING'),
  );
  if (pending.length > 0) {
    problems.push(
      `Hay ${pending.length} sondas con placeholder sin rellenar: ` +
      pending.map((p) => p.id).join(', ') +
      '. Sustituye prompt y expected antes de ejecutar.',
    );
  }

  const badExpected = PROBES.filter(
    (p) => !p.expected.startsWith('<<PENDING') && !UNION_TYPES.includes(p.expected),
  );
  if (badExpected.length > 0) {
    problems.push(
      'expected fuera de la unión Intent[\'type\']: ' +
      badExpected.map((p) => `${p.id}=${p.expected}`).join(', '),
    );
  }

  if (PROBES.length !== 18) {
    problems.push(`Se esperaban 18 sondas, hay ${PROBES.length}.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    problems.push(
      'Falta ANTHROPIC_API_KEY en el entorno. Es la misma clave que usa ' +
      'server.js:25 para reenviar a api.anthropic.com.',
    );
  }
  transport.apiKey = apiKey;

  return problems;
}

// ---------------------------------------------------------------------------
// Batería
// ---------------------------------------------------------------------------

async function main() {
  const problems = preflight();
  if (problems.length > 0) {
    console.error('[harness] no se ejecuta nada:');
    for (const p of problems) console.error('  - ' + p);
    process.exitCode = 1;
    return;
  }

  const IntentClassifier = await loadClassifier();

  console.log('# harness de clasificación — IntentClassifier.classify');
  console.log(`# sondas=${PROBES.length} repeticiones=${REPS} total=${PROBES.length * REPS} llamadas`);
  console.log(`# contexto fijo: ${PROJECT_MEMORY.component_registry.length} componentes, ${PROJECT_MEMORY.route_map.length} rutas, chatHistory=[]`);
  console.log('# registro crudo (una línea por invocación):');
  console.log('');

  const rows = [];

  for (const probe of PROBES) {
    const classes = [];
    for (let rep = 1; rep <= REPS; rep++) {
      transport.reset();
      let intent = null;
      try {
        // Invocación independiente: sin caché, sin reuso de respuesta previa,
        // sin AbortSignal. Cada llamada es un POST nuevo.
        intent = await IntentClassifier.classify(probe.prompt, PROJECT_MEMORY, CHAT_HISTORY);
      } catch (err) {
        // classify() no debería propagar (tiene catch), pero si lo hiciera la
        // batería no se detiene.
        transport.lastError = transport.lastError ?? `throw: ${err?.message ?? String(err)}`;
      }

      const { cls, detail } = classifyOutcome(intent);
      classes.push(cls);

      const reasoning = intent && typeof intent.reasoning === 'string' ? intent.reasoning : '';
      console.log(
        `RAW ${pad(probe.id, 3)} rep=${rep} class=${pad(cls, 16)}` +
        (detail ? ` err="${detail}"` : '') +
        ` reasoning="${reasoning.replace(/\s+/g, ' ')}"`,
      );

      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }

    const majority = majorityOf(classes);
    rows.push({
      id: probe.id,
      expected: probe.expected,
      classes,
      majority,
      unanimous: classes[0] === classes[1] && classes[1] === classes[2],
      match: majority === probe.expected,
    });
  }

  // -------------------------------------------------------------------------
  // Tabla resumen
  // -------------------------------------------------------------------------

  console.log('');
  console.log('# resumen');
  console.log(
    pad('id', 4) + pad('expected', 17) + pad('rep1', 17) + pad('rep2', 17) +
    pad('rep3', 17) + pad('mayoría', 17) + pad('unánime', 9) + 'match',
  );
  console.log('-'.repeat(103));
  for (const r of rows) {
    console.log(
      pad(r.id, 4) + pad(r.expected, 17) +
      pad(r.classes[0], 17) + pad(r.classes[1], 17) + pad(r.classes[2], 17) +
      pad(r.majority, 17) + pad(r.unanimous ? 'sí' : 'no', 9) +
      (r.match ? 'sí' : 'no'),
    );
  }

  const matches = rows.filter((r) => r.match).length;
  const unanimous = rows.filter((r) => r.unanimous).length;
  const errored = rows.filter((r) => r.classes.includes('ERROR')).length;
  console.log('-'.repeat(103));
  console.log(`# match con expected: ${matches}/${rows.length}`);
  console.log(`# unánimes: ${unanimous}/${rows.length}`);
  console.log(`# sondas con al menos un ERROR: ${errored}/${rows.length}`);
}

main().catch((err) => {
  console.error('[harness] fallo fuera de la batería:', err);
  process.exitCode = 1;
});
