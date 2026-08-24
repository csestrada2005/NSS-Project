/**
 * ddlVerdict — la taxonomía de cómo acabó un DDL, en una sola función pura.
 *
 * POR QUÉ ES UN MÓDULO Y NO UN `if` DENTRO DE MigrationRunner
 * -----------------------------------------------------------
 * La etiqueta que acaba en user_prompt ES el diagnóstico. Nadie va a mirar la
 * base para saber qué pasó: van a mirar forge_intent_log. Si dos estados
 * OPUESTOS comparten etiqueta, la consulta responde con seguridad algo falso, y
 * eso es peor que no tener telemetría. Aquí es pura y con tests para que la
 * taxonomía sea verificable mecánicamente en vez de por lectura.
 *
 * LA REGLA, EN UNA LÍNEA
 * ----------------------
 *   [DDL_FAILED:…]      el DDL NO se aplicó, y lo sabemos.
 *   [DDL_UNVERIFIED:…]  el DDL PUDO aplicarse y el instrumento no puede confirmarlo.
 *   [DDL_APPLIED:…]     el diff del schema lo demuestra.
 *
 * De dónde sale la distinción entre las dos primeras: el snapshot es
 * information_schema.columns — la forma que ya sirve el endpoint de schema. Ve
 * tablas y columnas, que es lo que produce prácticamente todo el DDL generado.
 * NO ve índices, políticas RLS ni grants. Así que "el schema no cambió" tiene
 * dos causas incompatibles:
 *
 *   (a) la base RECHAZÓ la sentencia — y entonces nos lo dijo, hay error.
 *   (b) la sentencia pasó pero cae fuera de lo que el instrumento mide (o era
 *       un no-op) — no hay error, y el diff está vacío de todas formas.
 *
 * El error de ejecución es lo que las separa, y es una señal que ya tenemos.
 * Meter las dos en [DDL_FAILED:] las vuelve indistinguibles por SQL siendo
 * diagnósticos opuestos: (a) pide arreglar el SQL, (b) pide mirar la base a
 * mano. Y un checkpoint que espere [DDL_FAILED:] de un SQL inválido a propósito
 * dejaría de discriminar nada, porque la etiqueta cubriría los dos mundos.
 *
 * El sesgo NO cambia: fail-closed. (b) sigue cerrando el intent con
 * outcome='failed'. Un falso negativo pide un reintento sobre DDL mayormente
 * idempotente; un falso positivo es el bug silencioso que esta cirugía existe
 * para matar. Lo que cambia es sólo que el log dice CUÁL de los dos fallos es.
 *
 * REGLA R2 INTACTA: todo esto vive en sufijos concatenados a user_prompt. Cero
 * columnas nuevas y cero valores de enum nuevos en forge_intent_log — `outcome`
 * sigue siendo 'success' o 'failed'.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * ddlGuard.js y migrationPath.js. El tipado vive en ddlVerdict.d.ts.
 */

/** El diff del schema lo demuestra. */
export const APPLIED = 'applied';
/** No se aplicó, y lo sabemos: la base lo rechazó. */
export const FAILED = 'failed';
/** Pudo aplicarse; el instrumento no alcanza a confirmarlo. */
export const UNVERIFIED = 'unverified';

/**
 * Deja un motivo en condiciones de vivir DENTRO de un sufijo `[...]`.
 *
 * El `]` es lo que cierra la marca: un mensaje de Postgres que lo contenga
 * partiría el sufijo en dos y toda consulta que parsee por corchetes leería
 * basura. Se recorta también el salto de línea (los errores de Postgres traen
 * DETAIL y HINT en líneas aparte) y la longitud, porque esto se concatena a un
 * prompt de usuario que ya puede ser largo.
 *
 * Defensivo a propósito: el caller ya sanea, pero este módulo es público y en
 * Cirugía 2 lo llamará el botón de aprobación.
 *
 * @param {unknown} reason
 * @returns {string}
 */
export function sanitizeReason(reason) {
  const flat = String(reason ?? '').replace(/[\s\][]+/g, ' ').trim();
  if (flat.length === 0) return 'unknown';
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

/**
 * Veredicto de una aplicación de DDL a partir de las DOS señales disponibles.
 *
 * `tables` es el resultado del diff de schema y es la ÚNICA prueba de que algo
 * se aplicó. `executionError` NO es señal de éxito —la función de ejecución
 * devuelve lo mismo se haya aplicado el DDL o no— pero sí es señal de rechazo:
 * cuando la base habla, habla para quejarse.
 *
 * @param {Iterable<string>} tables tablas que el diff mostró tocadas
 * @param {unknown} executionError error de la ejecución, o null/'' si no hubo
 * @returns {{ verdict: string, outcome: 'success'|'failed', reason: string|null, mark: string }}
 */
export function ddlVerdict(tables, executionError) {
  const touched = [];
  for (const t of tables ?? []) {
    if (typeof t === 'string' && t.length > 0 && !touched.includes(t)) touched.push(t);
  }
  const hasError = executionError !== null && executionError !== undefined && executionError !== '';
  const error = hasError ? sanitizeReason(executionError) : null;

  if (touched.length > 0) {
    const applied = ` [DDL_APPLIED:${touched.join(',')}]`;
    if (!error) {
      return { verdict: APPLIED, outcome: 'success', reason: null, mark: applied };
    }
    // El schema cambió Y la base se quejó. Por el camino actual —un solo POST,
    // un solo `execute` dentro de una función plpgsql, y por tanto una sola
    // transacción— esto no debería poder darse: un fallo revierte todo. Si
    // aparece, algo cambió por debajo y el log tiene que decir LAS DOS cosas en
    // vez de elegir una: quedarse con [DDL_APPLIED:] cantaría victoria sobre un
    // estado que nadie ha comprobado.
    return {
      verdict: APPLIED,
      outcome: 'success',
      reason: `partial:${error}`,
      mark: `${applied} [DDL_FAILED:partial:${error}]`,
    };
  }

  if (error) {
    // La base rechazó la sentencia. Esto es un fallo REAL y sabido: el SQL es
    // inválido, faltan permisos, la tabla ya existía. Se arregla el SQL.
    return {
      verdict: FAILED,
      outcome: 'failed',
      reason: `error:${error}`,
      mark: ` [DDL_FAILED:error:${error}]`,
    };
  }

  // Ni cambio ni queja. O era un no-op, o tocó algo que information_schema.columns
  // no mira (RLS, índices, grants). No podemos afirmar ninguna de las dos, así
  // que no afirmamos ninguna: se cierra en 'failed' (fail-closed) y la etiqueta
  // dice que el veredicto es "no verificable", no "no aplicado".
  return {
    verdict: UNVERIFIED,
    outcome: 'failed',
    reason: 'no_schema_change',
    mark: ' [DDL_UNVERIFIED:no_schema_change]',
  };
}
