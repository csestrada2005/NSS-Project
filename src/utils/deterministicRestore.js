/**
 * deterministicRestore — reposición SIN MODELO de los módulos que el plan borró
 * de más, y la decisión de si con eso el lote de reparación ya está resuelto.
 *
 * POR QUÉ EXISTE (y por qué es plain JS)
 * --------------------------------------
 * Cuando el error de compilación cita un módulo ausente que EXISTÍA antes de
 * este intent, el plan lo borró de más y su contenido exacto sigue disponible
 * en el mapa previo. La reparación correcta no es generativa: se repone byte a
 * byte y se acabó. Pedírselo al modelo es tirar la fuente de la verdad.
 *
 * La lógica vivía dentro de Verifier.ts, que importa PlatformService (fetch,
 * supabase, toast) y por tanto no se puede cargar desde `node --test`. Aquí,
 * como plain JS + .d.ts —mismo patrón que groupCompileErrors.js y
 * resolveModulePath.js— es directamente testeable: el caso "el plan borró un
 * módulo que otro archivo sigue importando" se reproduce y se verifica sin
 * levantar el navegador ni llamar a ningún modelo.
 */

import { candidatePathsFor } from './resolveModulePath.js';
import { labelForError } from './groupCompileErrors.js';

/** Etiqueta de clase de los errores que una reposición puede resolver entera. */
const UNRESOLVED_MODULE = 'unresolved import/module';

/**
 * Escaneo de los módulos que cita UN error, con su estado actual.
 *
 * Todo segmento entrecomillado del mensaje es candidato a specifier; los que no
 * son rutas del proyecto (nombres de import, paquetes bare, texto suelto)
 * resuelven a cero candidatos y se descartan aquí.
 *
 * @param {import('./groupCompileErrors').CompileErrorDetail} err
 * @param {Map<string, string>} files     Mapa VIVO del proyecto.
 * @param {Map<string, string>} universe  Mapa PREVIO al intent.
 * @returns {{ raw: string, candidates: string[], present: string|null, historical: string|null }[]}
 */
function scanErrorRefs(err, files, universe) {
  const refs = [];
  const message = err?.message ?? '';
  const importer = err?.file ?? null;

  for (const m of message.matchAll(/"([^"]+)"|'([^']+)'/g)) {
    const raw = (m[1] ?? m[2] ?? '').trim().replace(/^virtual:/, '');
    const candidates = candidatePathsFor(raw, importer);
    if (candidates.length === 0) continue;
    refs.push({
      raw,
      candidates,
      // Forma bajo la que el módulo existe AHORA (si existe).
      present: candidates.find((c) => files.has(c)) ?? null,
      // Forma bajo la que existía ANTES del intent: su path exacto, el que el
      // plan borró.
      historical: candidates.find((c) => universe.has(c)) ?? null,
    });
  }

  return refs;
}

/**
 * ARCHIVOS AUSENTES citados por los errores del lote.
 *
 * `universe` es el mapa PREVIO al intent: si el archivo existía antes, sabemos
 * su path exacto — es el que el plan borró — y aceptamos sólo ese; si nunca
 * existió, aceptamos los candidatos derivados del import (rutas del código, no
 * inventadas por el modelo).
 *
 * @param {import('./groupCompileErrors').RepairBatch} batch
 * @param {Map<string, string>} files
 * @param {Map<string, string>} universe
 * @returns {{ path: string, writable: string[], wasDeleted: boolean }[]}
 */
export function missingReferencedPaths(batch, files, universe) {
  const seen = new Set();
  const out = [];

  for (const err of batch.errors) {
    for (const ref of scanErrorRefs(err, files, universe)) {
      if (ref.present) continue; // el módulo existe: no falta nada
      const chosen = ref.historical ?? ref.candidates[0];
      if (seen.has(chosen)) continue;
      seen.add(chosen);
      out.push({
        path: chosen,
        writable: ref.historical ? [ref.historical] : ref.candidates,
        wasDeleted: ref.historical != null,
      });
    }
  }

  return out;
}

/**
 * ¿Queda ESTE error resuelto por la reposición?
 *
 * Sólo si (1) es un error de módulo no resuelto, (2) ningún módulo que cita
 * sigue ausente y (3) al menos uno de los que cita es de los que acabamos de
 * reponer. La tercera condición es la que impide dar por reparado un error que
 * la reposición no tocó (p. ej. `Cannot resolve "react-router-dom"`, un paquete
 * bare que no resuelve a ningún path del proyecto): ése tiene que seguir yendo
 * al modelo.
 *
 * @param {import('./groupCompileErrors').CompileErrorDetail} err
 * @param {Map<string, string>} files  Mapa YA restaurado.
 * @param {Map<string, string>} universe
 * @param {Set<string>} restoredSet
 * @returns {boolean}
 */
function errorResolvedByRestore(err, files, universe, restoredSet) {
  if (labelForError(err?.message ?? '') !== UNRESOLVED_MODULE) return false;

  let touched = false;
  for (const ref of scanErrorRefs(err, files, universe)) {
    if (!ref.present) return false; // sigue faltando algo que este error cita
    if (restoredSet.has(ref.present)) touched = true;
  }
  return touched;
}

/**
 * RESTAURACIÓN DETERMINISTA del lote, más la decisión de si hace falta el
 * modelo.
 *
 * Repone byte a byte todo módulo ausente que existía en `universe` (el plan lo
 * borró de más). Los ausentes que NUNCA existieron no se tocan: no hay nada que
 * restaurar y siguen su camino al modelo bajo la regla 4 del contrato.
 *
 * `skipModel` es lo que evita la llamada inútil: si la reposición resolvió
 * TODOS los errores del lote, mandarlo igualmente al modelo no puede arreglar
 * nada —ya está arreglado— y sí puede romper algo, porque el modelo recibe un
 * error cuya causa ya no existe y el contrato le deja como último recurso
 * quitar la referencia (regla 5). Se salta la llamada y el recompile confirma.
 *
 * Devuelve un mapa nuevo sólo si hubo algo que restaurar (si no, el mismo que
 * entró).
 *
 * @param {import('./groupCompileErrors').RepairBatch} batch
 * @param {Map<string, string>} files
 * @param {Map<string, string>} universe
 * @returns {{ files: Map<string, string>, restored: string[], skipModel: boolean }}
 */
export function planDeterministicRestore(batch, files, universe) {
  const restored = [];
  let out = files;

  for (const ref of missingReferencedPaths(batch, files, universe)) {
    if (!ref.wasDeleted) continue; // nunca existió → regla 4, lo escribe el modelo
    const original = universe.get(ref.path);
    if (original == null) continue; // defensivo: wasDeleted implica que está
    if (out === files) out = new Map(files);
    out.set(ref.path, original);
    restored.push(ref.path);
  }

  const restoredSet = new Set(restored);
  const skipModel =
    restored.length > 0 &&
    batch.errors.every((err) => errorResolvedByRestore(err, out, universe, restoredSet));

  return { files: out, restored, skipModel };
}

/**
 * Sufijo de telemetría para los módulos ausentes que el verify repuso.
 * Distingue las dos vías con nombres distintos, porque el coste y la fiabilidad
 * no son los mismos: `restored_files` es contenido EXACTO del proyecto repuesto
 * sin llamar al modelo; `recreated_files` es contenido que escribió el modelo
 * para un módulo que nunca existió. Cadena vacía cuando no hubo ninguno de los
 * dos, así que el log de siempre no cambia.
 *
 * @param {string[]} restored
 * @param {string[]} recreated
 * @returns {string}
 */
export function absentFilesTelemetry(restored, recreated) {
  const parts = [];
  if (restored.length > 0) parts.push(`restored_files=[${restored.join(',')}]`);
  if (recreated.length > 0) parts.push(`recreated_files=[${recreated.join(',')}]`);
  return parts.length > 0 ? `| ${parts.join(' ')}` : '';
}
