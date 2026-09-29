// Cola sobre UN worker persistente (server/typecheckWorker.js): las revisiones
// se atienden de a una, el hilo principal nunca se bloquea, y el worker
// conserva entre llamadas la caché de TypeScript (libs y tipos de las
// librerías ya parseados). Si el worker muere o una revisión excede el tiempo,
// se responde { available: false } — la revisión de tipos es fail-open.
import { Worker } from 'node:worker_threads';

const TIMEOUT_MS = 60_000;

let worker = null;
let nextId = 1;
const pending = new Map(); // id → { resolve, timer }

function settle(id, result) {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(result);
}

function failAll(reason) {
  for (const id of [...pending.keys()]) settle(id, { available: false, reason });
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./typecheckWorker.js', import.meta.url));
  worker.on('message', ({ id, result }) => settle(id, result));
  worker.on('error', (err) => {
    console.error('[typecheck] worker error:', err);
    worker = null;
    failAll('typecheck worker error');
  });
  worker.on('exit', (code) => {
    if (code !== 0) console.error('[typecheck] worker exited with code', code);
    worker = null;
    failAll('typecheck worker exited');
  });
  // Después de los escuchadores: agregar 'message' vuelve a enganchar el
  // worker al proceso. Sin esto, un script o test que lo usa no termina nunca.
  worker.unref();
  return worker;
}

/**
 * @param {Record<string, string>} files
 * @param {{ autoFix?: boolean }} [opts]
 * @returns {Promise<ReturnType<import('./typecheck.js').typecheckProject>>}
 */
export function runTypecheck(files, opts = {}) {
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      settle(id, { available: false, reason: 'typecheck timed out' });
      // Una revisión colgada bloquearía la cola: se reinicia el worker.
      worker?.terminate();
      worker = null;
    }, TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      getWorker().postMessage({ id, files, opts });
    } catch (err) {
      settle(id, { available: false, reason: `typecheck unavailable: ${err?.message ?? err}` });
    }
  });
}
