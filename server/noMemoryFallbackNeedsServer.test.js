import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptNeedsServer } from '../src/utils/serverLogicSignals.js';
import { isPlanLaneOnly } from '../src/utils/laneRouting.js';

// ---------------------------------------------------------------------------
// Cambio 8 — el fallback de intent de AIOrchestrator.processRequest para
// memory === null (~línea 1249: no hay ProjectMemory que pasarle a
// IntentClassifier, así que el LLM nunca corre) debe poblar needs_server con
// el mismo cinturón determinista que respalda a classify() cuando Haiku
// falla (Cambio 2), en vez de fijar needs_server=false a ciegas.
//
// POR QUÉ ESTE TEST NO INSTANCIA AIOrchestrator
// ----------------------------------------------
// AIOrchestrator.ts importa una veintena de servicios (SupabaseService,
// platformService, ContextService, ProjectMemoryService, Architect,
// Implementer, Verifier, DesignBriefService...) pensados para correr en el
// navegador contra un backend real. Levantarlos aquí exigiría un stub por
// cada uno — desproporcionado para un cambio de una línea, y ya hay un
// patrón mejor en este repo (server/intentLogSingleWriter.test.js) para
// verificar el cableado de AIOrchestrator sin instanciarlo: auditar el
// FUENTE. Este test combina esa auditoría con una prueba funcional real de
// las dos piezas puras que la línea conecta:
//   1. el fallback importa y usa promptNeedsServer(input), no `false` fijo
//      (si alguien revierte la línea, este test lo detecta);
//   2. promptNeedsServer + isPlanLaneOnly — código real, sin mocks — hacen
//      lo que el brief pide: un prompt que dispara el cinturón produce un
//      intent con needs_server:true, y ese intent fuerza el plan lane.
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ORCHESTRATOR_SRC = fs.readFileSync(path.join(SRC_DIR, 'services', 'AIOrchestrator.ts'), 'utf8');

/** Construye el MISMO objeto que arma el fallback de AIOrchestrator.ts cuando memory es null. */
function buildNoMemoryIntent(input) {
  const needsServer = promptNeedsServer(input);
  return {
    type: 'modify_existing',
    affected_files: [],
    needs_new_files: false,
    risk: 'medium',
    reasoning: 'No memory available; defaulting to modify_existing.',
    needs_server: needsServer,
    server_reason: needsServer ? 'deterministic signal' : '',
  };
}

test('fallback de memory null: needs_server viaja del cinturón determinista al plan lane', () => {
  // (1) auditoría de fuente — el fallback debe importar y usar el cinturón,
  // no reimplementarlo ni volver a fijar needs_server=false a ciegas.
  assert.match(
    ORCHESTRATOR_SRC,
    /import\s*\{\s*promptNeedsServer\s*\}\s*from\s*['"]\.\.\/utils\/serverLogicSignals\.js['"]/,
    'el fallback necesita importar el cinturón determinista, no reimplementarlo'
  );

  const marker = 'No memory available; defaulting to modify_existing.';
  const idx = ORCHESTRATOR_SRC.indexOf(marker);
  assert.ok(idx !== -1, 'no se encontró el fallback de memory===null — ¿se movió o se reescribió?');
  const window = ORCHESTRATOR_SRC.slice(idx, idx + 300);
  assert.ok(
    !/needs_server:\s*false\s*,/.test(window),
    'el fallback vuelve a fijar needs_server=false a ciegas; debe usar promptNeedsServer(input)'
  );
  assert.match(
    window,
    /needs_server:\s*noMemoryNeedsServer/,
    'el fallback debe poblar needs_server desde el resultado de promptNeedsServer(input)'
  );

  // (2) comportamiento real — con memory null y un prompt que dispara el
  // cinturón, el intent resultante trae needs_server:true, y por tanto
  // isPlanLaneOnly lo manda al plan lane.
  const serverIntent = buildNoMemoryIntent('quiero poder invitar usuarios y asignarles un rol de administrador');
  assert.equal(serverIntent.needs_server, true);
  assert.equal(serverIntent.server_reason, 'deterministic signal');
  assert.equal(isPlanLaneOnly(serverIntent), true);

  // No regresión: un prompt que no dispara el cinturón sigue en needs_server:false.
  const plainIntent = buildNoMemoryIntent('cambia el color principal del sitio');
  assert.equal(plainIntent.needs_server, false);
  assert.equal(plainIntent.server_reason, '');
});
