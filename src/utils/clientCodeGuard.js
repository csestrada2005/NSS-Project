/**
 * clientCodeGuard — detector DETERMINISTA de dos formas de código de cliente
 * peligroso: credenciales de terceros pegadas a mano, y escrituras directas
 * a una tabla de roles/permisos desde el navegador.
 *
 * EL AGUJERO QUE ESTO TAPA
 * ------------------------
 * El Verifier (src/services/Verifier.ts) compila y repara errores de
 * compilación — nunca inspecciona el CONTENIDO por reglas de seguridad.
 * `BACKEND_RULES` (src/services/promptRules.ts) ya le PIDE al modelo, en
 * texto, mover a una función de servidor cualquier lógica que necesite "a
 * secret the browser must never hold" o sea una "privileged write" — pero
 * es instrucción al LLM, no una inspección determinista. No se resuelve con
 * prompt — misma doctrina que el resto de esta familia de guards
 * (ddlGuard.js, deletionGuard.js, planGuard.js, rlsPolicyGuard.js): una
 * regla dura que el modelo incumple se resuelve con un guard determinista.
 *
 * LAS DOS COMPROBACIONES
 * -----------------------
 * (1) `hardcoded-credential` — un identificador-credencial (de un set
 *     cerrado, `CREDENTIAL_IDENTIFIER_NAMES`) asignado a un LITERAL de
 *     string, o un header `Authorization: 'Bearer <literal>'` pegado a
 *     mano. Una referencia (`import.meta.env.VITE_...`) no es un literal de
 *     string, así que no dispara por construcción.
 * (2) `role-table-write` — código de cliente que escribe
 *     (`insert`/`update`/`upsert`/`delete`) directamente en una tabla que
 *     ESTE MISMO lote de migraciones marca como tabla de roles/permisos
 *     (reutiliza `tablesWithRoleColumnInSql` de rlsPolicyGuard.js, la misma
 *     fuente de verdad que ya usa el guard de RLS).
 *
 * QUÉ NO HACE, A PROPÓSITO
 * -------------------------
 * Este guard sólo DETECTA Y AVISA — no reescribe nada, a diferencia de
 * `rlsPolicyGuard.js`. No hay una reparación de texto segura para "mueve
 * esta lógica a una función de servidor": eso es generar código nuevo, el
 * trabajo del pipeline principal, no el de un guard determinista. La
 * corrida SIGUE igual; no se retira el botón de aprobación (mismo trato que
 * `unparseable` en rlsPolicyGuard.js).
 *
 * POSTURA FAIL-OPEN, DECLARADA
 * ------------------------------
 * Contenido no-string, un archivo ilegible, `supabase.from(variable)` sin
 * literal, o un import con alias (`supabase as sb`): todo eso se salta en
 * silencio, sin lanzar y sin marcar `dangerous`. Es la postura OPUESTA a
 * `rlsPolicyGuard.js` (que es fail-closed sobre SQL ilegible) porque ese
 * guard reescribe SQL que va a aplicarse contra una base real — fallar
 * cerrado ahí protege una escritura irreversible. Este guard no reescribe
 * nada: fallar abierto en un caso ambiguo no compromete ninguna garantía ya
 * establecida, sólo implica que ese caso concreto no genera aviso.
 *
 * LÍMITES ACEPTADOS, NO RESUELTOS AQUÍ
 * --------------------------------------
 *  - Sin memoria de esquema entre corridas: sólo ve tablas de rol
 *    declaradas en la migración de ESTE MISMO intent. Una escritura de
 *    cliente a una tabla de rol creada en un intent ANTERIOR no dispara
 *    nada hoy.
 *  - `supabase.from(tableName)` con variable (sin literal): no se evalúa.
 *  - Un import con alias (`supabase as sb`) no se detecta: el anclaje es el
 *    identificador literal `supabase`.
 *  - Sin parser real (@babel/standalone): heurística de texto sobre
 *    comentarios/strings, como el resto de la familia. Un literal de tipo
 *    TypeScript entre el identificador y `=` (`const X: string = '...'`)
 *    puede hacer que esta pasada no reconozca `X` como el identificador —
 *    no es un patrón que el pipeline genere hoy (ver
 *    src/services/patterns/registry.ts), así que no se blinda contra él en
 *    v1.
 *
 * REGLA NO NEGOCIABLE
 * ---------------------
 * Ningún finding, telemetría ni aviso de este guard contiene JAMÁS el VALOR
 * del literal — sólo el path y el nombre del identificador/tabla. Ver el
 * límite duro de CLAUDE.md ("nunca pegar secretos... en archivos, commits
 * ni chat"). Un test de regresión dedicado lo verifica.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * el resto de esta familia. El tipado vive en clientCodeGuard.d.ts.
 */

/**
 * Set cerrado de nombres de identificador que marcan una credencial de
 * tercero. Deliberadamente EXCLUIDOS: `key`/`token`/`role` a secas
 * (demasiado genéricos — `sortKey`, `nextToken`, `userRole` son legítimos)
 * y `password` (fuera de alcance: auth de usuario, no credencial de
 * tercero). Match por prefijo/sufijo de PALABRA COMPLETA, no por substring:
 * `STRIPE_SECRET_KEY` matchea (sufijo `secret_key`), `secretary` no.
 */
export const CREDENTIAL_IDENTIFIER_NAMES = Object.freeze([
  'api_key',
  'secret_key',
  'secret',
  'access_token',
  'auth_token',
  'api_token',
  'service_role',
  'service_role_key',
  'client_secret',
  'private_key',
]);

const CREDENTIAL_WORD_LISTS = CREDENTIAL_IDENTIFIER_NAMES.map((n) => n.split('_'));

/**
 * Descompone un identificador (camelCase, CONSTANT_CASE o snake_case) en
 * palabras en minúsculas, para comparar contra `CREDENTIAL_WORD_LISTS` por
 * prefijo/sufijo completo.
 *
 * @param {unknown} name
 * @returns {string[]}
 */
function identifierWords(name) {
  if (typeof name !== 'string' || name.length === 0) return [];
  const withBoundaries = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
  return withBoundaries
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/**
 * ¿Este identificador nombra una credencial de tercero? Comprueba si alguna
 * entrada de `CREDENTIAL_IDENTIFIER_NAMES` aparece como PREFIJO o SUFIJO
 * completo de las palabras del identificador (nunca en medio, para no
 * disparar sobre compuestos accidentales).
 *
 * @param {unknown} name
 * @returns {boolean}
 */
function isCredentialIdentifier(name) {
  const words = identifierWords(name);
  if (words.length === 0) return false;
  for (const cWords of CREDENTIAL_WORD_LISTS) {
    const n = cWords.length;
    if (words.length < n) continue;
    const target = cWords.join('_');
    if (words.slice(0, n).join('_') === target) return true;
    if (words.slice(words.length - n).join('_') === target) return true;
  }
  return false;
}

/**
 * Enmascara comentarios `//` y `/* *​/` de un texto JS/TS con espacios
 * (preserva longitud y saltos de línea), SIN tocar el contenido de strings
 * — necesitamos leer strings, sólo neutralizar comentarios para no disparar
 * sobre un ejemplo documentado en un `//`. Heurística de texto, no un
 * parser: no reconoce regex literals (`/.../`), mismo tipo de límite que
 * `maskSqlNoise` en ddlGuard.js para su propio dominio.
 *
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
  const src = String(text ?? '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      out += src.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }

    if (ch === '/' && next === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? src.length : j + 2;
      out += src.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

// identificador (con o sin comillas, para propiedades de objeto) seguido de
// `=` o `:` y un literal de string/template. El identificador se filtra
// DESPUÉS contra `isCredentialIdentifier` — este regex es deliberadamente
// amplio (matchea cualquier `id = '...'` o `id: '...'`) porque acotar aquí
// qué es "asignación" en JS/TS sin un parser real es una fuente peor de
// falsos negativos que filtrar después.
const ASSIGN_STRING_RE =
  /(["'])?([A-Za-z_$][A-Za-z0-9_$]*)\1?\s*[:=]\s*(['"`])((?:\\.|(?!\3)[^\\\n])*)\3/g;

/**
 * ¿Este literal (ya extraído, sin las comillas que lo delimitan) es
 * dinámico en vez de un valor pegado a mano? Sólo el caso de interpolación
 * de template literal (`` `Bearer ${token}` ``) cuenta como dinámico aquí.
 *
 * @param {string} raw
 * @returns {boolean}
 */
function looksInterpolated(raw) {
  return /\$\{/.test(raw);
}

/**
 * Hallazgos de Comprobación 1 (`hardcoded-credential`) sobre el texto de UN
 * archivo, ya con los comentarios neutralizados por `stripComments`.
 *
 * @param {string} masked
 * @param {string} path
 * @returns {{ path: string, reason: 'hardcoded-credential', identifier: string, table: null, method: null }[]}
 */
function findHardcodedCredentials(masked, path) {
  const findings = [];
  ASSIGN_STRING_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGN_STRING_RE.exec(masked))) {
    const identifier = m[2];
    const literal = m[4];
    if (looksInterpolated(literal)) continue;

    const isAuthHeader =
      identifier.toLowerCase() === 'authorization' && /^Bearer\s+\S+/i.test(literal);
    if (isAuthHeader) {
      findings.push({
        path,
        reason: 'hardcoded-credential',
        identifier: 'Authorization',
        table: null,
        method: null,
      });
      continue;
    }

    if (isCredentialIdentifier(identifier)) {
      findings.push({
        path,
        reason: 'hardcoded-credential',
        identifier,
        table: null,
        method: null,
      });
    }
  }
  return findings;
}

const DANGEROUS_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

// Ancla en el identificador LITERAL `supabase` — cubre tanto el cliente
// importado que BACKEND_RULES exige como un `createClient(...)` ad-hoc (ver
// src/services/patterns/registry.ts:325): ambas formas usan esa misma
// variable en este codebase. Un import con alias (`supabase as sb`) no
// matchea — límite aceptado, documentado en la cabecera del módulo.
const ROLE_WRITE_RE =
  /\bsupabase\s*\.\s*from\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;

/**
 * Hallazgos de Comprobación 2 (`role-table-write`) sobre el texto de UN
 * archivo, ya con los comentarios neutralizados por `stripComments`.
 *
 * @param {string} masked
 * @param {string} path
 * @param {Set<string>} roleTables tablas normalizadas (minúsculas) que este
 *   mismo lote de migraciones marca como de rol/permisos.
 * @returns {{ path: string, reason: 'role-table-write', identifier: null, table: string, method: string }[]}
 */
function findClientRoleWrites(masked, path, roleTables) {
  const findings = [];
  if (!roleTables || roleTables.size === 0) return findings;
  ROLE_WRITE_RE.lastIndex = 0;
  let m;
  while ((m = ROLE_WRITE_RE.exec(masked))) {
    const table = m[2].trim();
    const method = m[3].toLowerCase();
    if (!DANGEROUS_METHODS.has(method)) continue;
    if (!roleTables.has(table.toLowerCase())) continue;
    findings.push({ path, reason: 'role-table-write', identifier: null, table, method });
  }
  return findings;
}

/**
 * Evalúa un lote de archivos de cliente para las DOS comprobaciones a la
 * vez. `roleTables` es opcional (Set vacío por defecto): el fast lane y el
 * simple lane nunca tocan `.sql`, así que llaman esto sin segundo argumento
 * y sólo Comprobación 1 puede disparar — Comprobación 2 necesita
 * `roleTables` no vacío por construcción (`findClientRoleWrites` corta
 * temprano si está vacío).
 *
 * Fail-open sobre contenido no-string: no lanza, ese archivo se salta sin
 * dejar hallazgo. Postura opuesta a `rlsPolicyGuard.js` porque este guard
 * no reescribe nada — ver cabecera del módulo.
 *
 * @param {Iterable<{ path: string, content: unknown }>} files
 * @param {Set<string>} [roleTables]
 * @returns {{ dangerous: boolean, findings: Array<{ path: string, reason: 'hardcoded-credential' | 'role-table-write', identifier: string | null, table: string | null, method: string | null }> }}
 */
export function evaluateClientCode(files, roleTables = new Set()) {
  const findings = [];
  for (const f of files ?? []) {
    if (!f || typeof f.path !== 'string' || f.path.length === 0) continue;
    if (typeof f.content !== 'string') continue;
    const masked = stripComments(f.content);
    findings.push(...findHardcodedCredentials(masked, f.path));
    findings.push(...findClientRoleWrites(masked, f.path, roleTables));
  }
  return { dangerous: findings.length > 0, findings };
}

/**
 * Sufijo de telemetría para forge_intent_log: mismo mecanismo exacto que
 * `rlsPolicyBlockedTelemetry` — espacio delante, corchetes, entradas
 * `path:identifier` ordenadas y deduplicadas, cadena vacía sin hallazgos.
 * NUNCA incluye el valor del literal — sólo path e identifier.
 *
 * @param {Iterable<{ path: string, identifier: string | null, reason: string }>} findings
 * @returns {string}
 */
export function clientSecretTelemetry(findings) {
  const entries = [];
  for (const f of findings ?? []) {
    if (!f || f.reason !== 'hardcoded-credential') continue;
    if (typeof f.path !== 'string' || f.path.length === 0) continue;
    if (typeof f.identifier !== 'string' || f.identifier.length === 0) continue;
    entries.push(`${f.path}:${f.identifier}`);
  }
  if (entries.length === 0) return '';
  return ` [CLIENT_SECRET_HARDCODED:${[...new Set(entries)].sort().join(',')}]`;
}

/**
 * Sufijo de telemetría para forge_intent_log: mismo mecanismo, entradas
 * `path:table:method` ordenadas y deduplicadas, cadena vacía sin hallazgos.
 *
 * @param {Iterable<{ path: string, table: string | null, method: string | null, reason: string }>} findings
 * @returns {string}
 */
export function clientRoleWriteTelemetry(findings) {
  const entries = [];
  for (const f of findings ?? []) {
    if (!f || f.reason !== 'role-table-write') continue;
    if (typeof f.path !== 'string' || f.path.length === 0) continue;
    if (typeof f.table !== 'string' || f.table.length === 0) continue;
    if (typeof f.method !== 'string' || f.method.length === 0) continue;
    entries.push(`${f.path}:${f.table}:${f.method}`);
  }
  if (entries.length === 0) return '';
  return ` [CLIENT_ROLE_WRITE:${[...new Set(entries)].sort().join(',')}]`;
}

/**
 * Los avisos en español, un mensaje por hallazgo distinto
 * (path+identifier, o path+table+method), en orden determinista
 * (ordenados). Mismo tono ya establecido en `rlsPolicyWarnings`: "Guard de
 * seguridad: ... No la corregí automáticamente — ...". Nunca menciona el
 * valor del literal.
 *
 * @param {Iterable<{ path: string, reason: string, identifier: string | null, table: string | null, method: string | null }>} findings
 * @returns {string[]}
 */
export function clientCodeWarnings(findings) {
  const credentialKeys = new Set();
  const roleWriteKeys = new Set();
  for (const f of findings ?? []) {
    if (!f) continue;
    if (f.reason === 'hardcoded-credential' && f.path && f.identifier) {
      credentialKeys.add(`${f.path}\u0000${f.identifier}`);
    } else if (f.reason === 'role-table-write' && f.path && f.table && f.method) {
      roleWriteKeys.add(`${f.path}\u0000${f.table}\u0000${f.method}`);
    }
  }

  const warnings = [];
  for (const key of [...credentialKeys].sort()) {
    const [path, identifier] = key.split('\u0000');
    warnings.push(
      `Guard de seguridad: encontré una credencial ("${identifier}") escrita directamente en ` +
      `${path}. Cualquiera que abra la consola del navegador puede verla. No la corregí ` +
      `automáticamente — muévela a una función de servidor y revisa el archivo antes de publicar.`
    );
  }
  for (const key of [...roleWriteKeys].sort()) {
    const [path, table, method] = key.split('\u0000');
    warnings.push(
      `Guard de seguridad: ${path} escribe directamente (${method}) en "${table}", una tabla de ` +
      `roles/permisos que este mismo cambio creó. Cualquier visitante podría modificarla desde la ` +
      `consola del navegador. No lo corregí automáticamente — mueve esta escritura a una función de servidor.`
    );
  }
  return warnings;
}
