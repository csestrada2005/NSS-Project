// ---------------------------------------------------------------------------
// compileCache — el servidor recuerda las últimas compilaciones EXITOSAS
// (2026-09-30). Tras un cambio de la IA se compilaba dos veces el mismo
// proyecto: el Verifier (para saber que compila) y enseguida el preview (para
// pintarlo), con los mismos archivos. esbuild es determinista para la misma
// entrada, así que la segunda respuesta sale de aquí al instante.
//
// La clave es un hash de TODOS los archivos (ruta + contenido) y de las
// credenciales de DB que se inyectan en el build: un proyecto con base de datos
// compilado con y sin credenciales produce salidas distintas y NUNCA comparte
// entrada. Las credenciales sólo entran al hash, no se guardan.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';

/**
 * @param {Record<string, string>} files
 * @param {unknown} dbCredentials
 */
export function compileCacheKey(files, dbCredentials) {
  const h = crypto.createHash('sha256');
  for (const path of Object.keys(files ?? {}).sort()) {
    h.update(path);
    h.update('\u0000');
    h.update(String(files[path]));
    h.update('\u0001');
  }
  h.update('\u0002');
  h.update(dbCredentials ? JSON.stringify(dbCredentials) : 'no-db');
  return h.digest('hex');
}

/**
 * LRU pequeño con caducidad. `now` es inyectable para los tests.
 * @param {{ max?: number, ttlMs?: number, now?: () => number }} [opts]
 */
export function createCompileCache({ max = 6, ttlMs = 10 * 60_000, now = Date.now } = {}) {
  const entries = new Map(); // key → { value, at }
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key); // reinsertar = más reciente
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, at: now() });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    get size() {
      return entries.size;
    },
  };
}
