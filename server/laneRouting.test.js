import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_LANE_ONLY_TYPES,
  canEnterFastLane,
  isPlanLaneOnly,
  isSimpleEditIntent,
} from '../src/utils/laneRouting.js';

// ---------------------------------------------------------------------------
// laneRouting — el destino de un database_change no puede depender del dado.
//
// EL INCIDENTE
// ------------
// Mismo prompt ("añade una tabla de pedidos"), dos días, dos resultados. El
// 2026-08-20 el clasificador devolvió risk='medium' y el intent bajó al plan
// lane: migración escrita y ejecutada. Hoy devolvió risk='low' con un solo
// affected_file —igual de plausible para el mismo texto— y cayó al simple lane,
// donde murió preguntando "¿qué componente del frontend?".
//
// POR QUÉ MORÍA, Y POR QUÉ NO ERA UN FALLO SUYO
// ---------------------------------------------
// El targeting del simple lane filtra sus candidatos con isSelectableSrcFile:
// sólo .ts/.tsx/.js/.jsx bajo src/. El entregable de un database_change es un
// .sql bajo supabase/migrations/. No es que la lane fallara en encontrarlo: es
// que el archivo no podía estar en el conjunto donde buscaba. Un callejón sin
// salida por construcción, que salía a la superficie disfrazado de duda.
//
// Lo que fijan estos tests es la regla, no el síntoma: database_change no entra
// en las lanes rápidas SEA CUAL SEA su risk. Y —igual de importante— que la
// exclusión no se llevó por delante a los tipos que sí viven en src/, que es la
// manera en que un arreglo de ruteo se convierte en una regresión.
// ---------------------------------------------------------------------------

/** Intent con los campos que miran las puertas; el resto no les importa. */
const intent = (over = {}) => ({
  type: 'modify_existing',
  risk: 'medium',
  affected_files: [],
  requiredPatternIds: [],
  ...over,
});

// --- (1) simple lane -------------------------------------------------------

test('database_change con risk=low y affected_files=[] NO entra al simple lane', () => {
  assert.equal(
    isSimpleEditIntent(intent({ type: 'database_change', risk: 'low', affected_files: [] })),
    false
  );
});

test('la exclusión del simple lane no depende del risk ni de affected_files', () => {
  for (const risk of ['low', 'medium', 'high']) {
    for (const affected_files of [[], ['supabase/migrations/20260824000000_x.sql'], ['a.sql', 'b.sql']]) {
      assert.equal(
        isSimpleEditIntent(intent({ type: 'database_change', risk, affected_files })),
        false,
        `risk=${risk} affected_files=${affected_files.length}`
      );
    }
  }
});

// --- (2) fast lane ---------------------------------------------------------

test('database_change con selección y risk=low NO entra al fast lane', () => {
  assert.equal(
    canEnterFastLane({
      intent: intent({ type: 'database_change', risk: 'low' }),
      hasSelection: true,
      selectionFileExists: true,
    }),
    false
  );
});

test('la exclusión del fast lane tampoco depende del risk', () => {
  for (const risk of ['low', 'medium', 'high']) {
    assert.equal(
      canEnterFastLane({
        intent: intent({ type: 'database_change', risk }),
        hasSelection: true,
        selectionFileExists: true,
      }),
      false,
      `risk=${risk}`
    );
  }
});

// --- (3) no estrechar de más: lo que hoy entra, sigue entrando -------------

test('los intents que hoy entran al simple lane siguen entrando', () => {
  // style_change entra por su tipo, con cualquier risk.
  for (const risk of ['low', 'medium', 'high']) {
    assert.equal(isSimpleEditIntent(intent({ type: 'style_change', risk })), true, `style/${risk}`);
  }
  // El resto entra por risk=low con a lo sumo un archivo afectado.
  for (const type of ['modify_existing', 'fix_bug', 'new_feature', 'add_page', 'refactor', 'question']) {
    assert.equal(
      isSimpleEditIntent(intent({ type, risk: 'low', affected_files: [] })),
      true,
      `${type}/sin archivos`
    );
    assert.equal(
      isSimpleEditIntent(intent({ type, risk: 'low', affected_files: ['src/App.tsx'] })),
      true,
      `${type}/un archivo`
    );
  }
});

test('lo que hoy NO entra al simple lane sigue sin entrar', () => {
  // risk medio/alto sin ser style_change.
  assert.equal(isSimpleEditIntent(intent({ type: 'modify_existing', risk: 'medium' })), false);
  // risk bajo pero tocando dos archivos.
  assert.equal(
    isSimpleEditIntent(
      intent({ type: 'fix_bug', risk: 'low', affected_files: ['src/A.tsx', 'src/B.tsx'] })
    ),
    false
  );
  // patrones obligatorios: exigen el pipeline completo.
  assert.equal(
    isSimpleEditIntent(intent({ type: 'style_change', risk: 'low', requiredPatternIds: ['p1'] })),
    false
  );
});

test('los intents que hoy entran al fast lane siguen entrando', () => {
  for (const type of ['style_change', 'modify_existing', 'fix_bug', 'refactor']) {
    assert.equal(
      canEnterFastLane({
        intent: intent({ type, risk: 'low' }),
        hasSelection: true,
        selectionFileExists: true,
      }),
      true,
      type
    );
  }
  // style_change entra aunque el risk no sea bajo.
  assert.equal(
    canEnterFastLane({
      intent: intent({ type: 'style_change', risk: 'high' }),
      hasSelection: true,
      selectionFileExists: true,
    }),
    true
  );
});

test('el fast lane sigue exigiendo selección y archivo existente', () => {
  const cheap = intent({ type: 'style_change', risk: 'low' });
  assert.equal(canEnterFastLane({ intent: cheap, hasSelection: false, selectionFileExists: true }), false);
  assert.equal(canEnterFastLane({ intent: cheap, hasSelection: true, selectionFileExists: false }), false);
  // Y sigue rechazando los intents con patrones obligatorios.
  assert.equal(
    canEnterFastLane({
      intent: intent({ type: 'style_change', risk: 'low', requiredPatternIds: ['p1'] }),
      hasSelection: true,
      selectionFileExists: true,
    }),
    false
  );
});

// --- la regla, nombrada ----------------------------------------------------

test('database_change es plan-lane-only; los demás tipos no lo son', () => {
  assert.deepEqual([...PLAN_LANE_ONLY_TYPES], ['database_change']);
  assert.equal(isPlanLaneOnly(intent({ type: 'database_change' })), true);
  for (const type of ['style_change', 'modify_existing', 'fix_bug', 'new_feature', 'add_page', 'refactor', 'question']) {
    assert.equal(isPlanLaneOnly(intent({ type })), false, type);
  }
});

// ---------------------------------------------------------------------------
// C1-b/c — affected_files fuera del universo de src/ y el cinturón de
// `supabase/functions/` sobre el prompt crudo. Bloque 2 (C).
// ---------------------------------------------------------------------------

test('affected_files: [src/App.tsx] sigue permitiendo el simple lane', () => {
  assert.equal(
    isSimpleEditIntent(intent({ type: 'fix_bug', risk: 'low', affected_files: ['src/App.tsx'] })),
    true
  );
});

test('affected_files con una Edge Function fuerza el plan lane', () => {
  assert.equal(
    isPlanLaneOnly(
      intent({ type: 'fix_bug', risk: 'low', affected_files: ['supabase/functions/x/index.ts'] })
    ),
    true
  );
});

test('affected_files mezclando src/ y una Edge Function fuerza el plan lane (basta uno)', () => {
  assert.equal(
    isPlanLaneOnly(
      intent({
        type: 'fix_bug',
        risk: 'low',
        affected_files: ['src/App.tsx', 'supabase/functions/x/index.ts'],
      })
    ),
    true
  );
});

test('affected_files con una migración SQL fuerza el plan lane', () => {
  assert.equal(
    isPlanLaneOnly(
      intent({ type: 'fix_bug', risk: 'low', affected_files: ['supabase/migrations/x.sql'] })
    ),
    true
  );
});

test('affected_files: [] no cambia el comportamiento de hoy', () => {
  assert.equal(
    isPlanLaneOnly(intent({ type: 'fix_bug', risk: 'low', affected_files: [] })),
    false
  );
});

test('affected_files null o malformado es fail-closed a plan lane', () => {
  assert.equal(isPlanLaneOnly(intent({ type: 'fix_bug', risk: 'low', affected_files: null })), true);
  assert.equal(
    isPlanLaneOnly(intent({ type: 'fix_bug', risk: 'low', affected_files: 'not-an-array' })),
    true
  );
  assert.equal(
    isPlanLaneOnly(intent({ type: 'fix_bug', risk: 'low', affected_files: [42] })),
    true
  );
});

test('el prompt crudo mencionando supabase/functions/ fuerza el plan lane aunque el intent sea barato', () => {
  const cheapIntent = intent({ type: 'style_change', risk: 'low', affected_files: [] });
  assert.equal(
    isSimpleEditIntent(cheapIntent, 'crea una Edge Function en supabase/functions/ping-test/index.ts'),
    false
  );
  assert.equal(
    isPlanLaneOnly(cheapIntent, 'crea una Edge Function en supabase/functions/ping-test/index.ts'),
    true
  );
});

test('style_change con affected_files vacío sigue en fast/simple lane (no regresión)', () => {
  const cheapIntent = intent({ type: 'style_change', risk: 'low', affected_files: [] });
  assert.equal(isSimpleEditIntent(cheapIntent), true);
  assert.equal(
    canEnterFastLane({ intent: cheapIntent, hasSelection: true, selectionFileExists: true }),
    true
  );
});

// ---------------------------------------------------------------------------
// C2-3 — needs_server es un eje independiente del type: fuerza el plan lane
// sea cual sea risk y affected_files, porque el entregable vive en
// supabase/functions/, fuera del universo de fast/simple lane.
// ---------------------------------------------------------------------------

test('needs_server=true fuerza plan lane con risk=low y affected_files vacío', () => {
  const cheapIntent = intent({ type: 'style_change', risk: 'low', affected_files: [], needs_server: true });
  assert.equal(isPlanLaneOnly(cheapIntent), true);
  assert.equal(isSimpleEditIntent(cheapIntent), false);
  assert.equal(
    canEnterFastLane({ intent: cheapIntent, hasSelection: true, selectionFileExists: true }),
    false
  );
});

test('needs_server=true fuerza plan lane incluso con un solo affected_file bajo src/', () => {
  const cheapIntent = intent({
    type: 'modify_existing',
    risk: 'low',
    affected_files: ['src/App.tsx'],
    needs_server: true,
  });
  assert.equal(isPlanLaneOnly(cheapIntent), true);
  assert.equal(isSimpleEditIntent(cheapIntent), false);
});

test('needs_server=false o ausente no cambia nada de lo que ya pasaba', () => {
  const noServerIntent = intent({ type: 'style_change', risk: 'low', affected_files: [], needs_server: false });
  assert.equal(isPlanLaneOnly(noServerIntent), false);
  assert.equal(isSimpleEditIntent(noServerIntent), true);

  const noFieldIntent = intent({ type: 'style_change', risk: 'low', affected_files: [] });
  assert.equal(isPlanLaneOnly(noFieldIntent), false);
  assert.equal(isSimpleEditIntent(noFieldIntent), true);
  assert.equal(
    canEnterFastLane({ intent: noFieldIntent, hasSelection: true, selectionFileExists: true }),
    true
  );
});
