// Hilo aparte para la revisión de tipos: typecheckProject ocupa la CPU 3–5 s y,
// corriendo en el hilo principal, congelaría el servidor entero (compilaciones,
// chat, el resto de los usuarios) mientras dura.
import { parentPort } from 'node:worker_threads';
import { typecheckProject } from './typecheck.js';

parentPort.on('message', ({ id, files, opts }) => {
  try {
    parentPort.postMessage({ id, result: typecheckProject(files, opts) });
  } catch (err) {
    parentPort.postMessage({ id, result: { available: false, reason: `typecheck crashed: ${err?.message ?? err}` } });
  }
});
