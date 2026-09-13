/**
 * rlsPolicyGuard — BLOQUE 1 (cirugía G-2): un guard determinista sobre el
 * CONTENIDO SQL de un lote de migraciones, que detecta políticas RLS que
 * abren escritura pública sobre una tabla con columna de rol/permisos.
 *
 * EL AGUJERO QUE ESTO TAPA
 * ------------------------
 * Medido en vivo sobre un proyecto cliente: Wyrd generó una Edge Function
 * correcta (`supabase/functions/manage-users/index.ts`) con el comentario
 * "This is the ONLY place where privileged mutations occur", y EN LA MISMA
 * corrida generó una migración cuyo propio plan decía: "Adds RLS policies
 * for public insert and update so the invite and role-assignment flows work
 * without auth sessions". Resultado: cualquier visitante con la consola del
 * navegador podía hacer un UPDATE directo sobre `app_users` y asignarse
 * `role='admin'`. La Edge Function quedaba decorativa.
 *
 * No se resuelve con prompt — precedente G-1 (`src/utils/planGuard.js`): una
 * regla dura que el modelo incumple se resuelve con un guard determinista,
 * nunca con más texto en el system prompt.
 *
 * BLOQUE 1-BIS — DE LISTA DE PROHIBIDOS A LISTA DE PERMITIDOS
 * -------------------------------------------------------------
 * La primera versión de este guard enumeraba qué era peligroso: "INSERT,
 * UPDATE o ALL". El checkpoint en vivo sobre Vertigo
 * (087ddaf3-6236-47ae-ba72-bc96887a9691) enseñó por qué una enumeración de
 * prohibidos no cierra la categoría: el guard eliminó correctamente las
 * políticas públicas de insert y update, pero dejó viva ésta:
 *
 *   create policy "public_delete_app_users"
 *     on public.app_users
 *     for delete
 *     using (true);
 *
 * DELETE público sobre la tabla de usuarios — cualquier visitante borra a
 * todos los administradores desde la consola del navegador. `DELETE` no
 * estaba en la lista de prohibidos porque nadie lo puso; ésa es exactamente
 * la falla estructural de enumerar lo malo. Desde BLOQUE 1-BIS el criterio
 * está invertido: sobre una tabla con columna de rol, la ÚNICA política
 * pública/anónima ACEPTABLE es SELECT (`ALLOWED_PUBLIC_COMMANDS`). Cualquier
 * otra —DELETE, INSERT, UPDATE, ALL, o una forma futura que hoy no existe—
 * cae. Esto cierra la categoría entera en vez de los casos que se nos
 * ocurrieron, la misma doctrina fail-closed que ya documenta la cabecera de
 * `migrationGate.js` ("ante la duda, true"): un falso positivo cuesta una
 * política de más eliminada, un falso negativo cuesta un agujero de
 * privilegios, y la asimetría decide el default.
 *
 * LA CONDICIÓN PELIGROSA — LAS TRES A LA VEZ
 * -------------------------------------------
 *  (1) una política RLS que concede cualquier operación DISTINTA de SELECT
 *  (2) a un rol público/anónimo (`anon`, `public`, o sin cláusula `TO` —que
 *      en Postgres cae por defecto a PUBLIC)
 *  (3) sobre una tabla que tiene una columna de rol/permisos
 *
 * Una política pública de SELECT sobre una tabla de productos no dispara
 * nada. Una política de INSERT restringida a `authenticated` tampoco: la
 * asimetría de riesgo está en la escritura pública sobre una tabla que
 * decide privilegios, no en RLS pública en general — y una tabla SIN columna
 * de rol no se toca, haga lo que haga su RLS: el alcance de este guard son
 * las tablas de permisos, no la seguridad general del proyecto.
 *
 * "TABLA CON COLUMNA DE ROL" — CÓMO SE IDENTIFICA, Y EL ANCLAJE
 * ---------------------------------------------------------------
 * INTOCADO por BLOQUE 1-BIS. Por el propio DDL del lote (`CREATE TABLE` /
 * `ALTER TABLE ... ADD COLUMN`), contra el set cerrado `ROLE_COLUMN_NAMES`.
 * La comparación es SIEMPRE por IDENTIFICADOR COMPLETO, nunca por subcadena
 * ni por regex de límite de palabra: un `\b` de regex no separa `control` de
 * `rol` (son la misma "palabra" para el motor de regex, `_` y letras son
 * todos `\w`), así que un anclaje por `\b` habría dejado pasar el mismo falso
 * positivo. La única forma de que "una tabla llamada `roles_de_juego`" o "una
 * columna llamada `control`" no disparen el guard es no buscar subcadenas en
 * el SQL crudo en ningún punto: aquí se extrae cada identificador de columna
 * como token completo (`CREATE TABLE (...)`, `ADD COLUMN <nombre>`) y se
 * compara con `===` contra el set, tras normalizar comillas/mayúsculas.
 * `roles_de_juego` no es igual a `roles`; `control` no es igual a `role`.
 * Precedente medido: C2-3, donde el literal `'rol'` hizo match dentro de
 * `"control"`.
 *
 * FAIL-CLOSED
 * -----------
 * INTOCADO por BLOQUE 1-BIS. Un archivo cuyo contenido no es una cadena
 * legible (no string, vacío) no puede analizarse para NINGUNA de las tres
 * condiciones — ni para descartar las políticas, ni para encontrar las
 * tablas con columna de rol. Ante esa duda el veredicto es peligroso, con
 * `reason: 'unparseable'`: no hay `table`/`policy` que reportar porque no hay
 * nada que se haya podido leer, pero `dangerous` sigue en `true`. La
 * asimetría lo justifica, mismo razonamiento que `migrationGate.js`.
 *
 * EL GATEO SIGUE SIENDO POR CONTENIDO, NO POR intent.type
 * ---------------------------------------------------------
 * Decisión deliberada, no un descuido: la etiqueta la produce un LLM y un
 * guard de seguridad no puede depender de que el clasificador haya acertado
 * — misma doctrina que C-D. No se "arregla" gateándolo a `database_change`.
 *
 * FORMA DEL VEREDICTO
 * -------------------
 * No un booleano pelado: cada hallazgo trae `table`, `policy`, `command` y el
 * `statement` SQL exacto que lo disparó (para poder eliminarlo sin tocar el
 * resto del archivo), porque ese detalle viaja al aviso del usuario y a la
 * telemetría.
 *
 * LOS COMENTARIOS HUÉRFANOS (BLOQUE 1-BIS, CAMBIO 2)
 * -----------------------------------------------------
 * El mismo checkpoint de Vertigo enseñó un segundo fallo: al eliminar una
 * política, la primera versión dejaba vivo el comentario SQL que la
 * introducía —
 *
 *   -- Allow anyone to insert new rows (required for the invite flow without auth)
 *
 * — con la política ya borrada debajo. No es cosmético: esa migración vuelve
 * al modelo como contexto de schema en corridas posteriores, y dejar escrito
 * "allow anyone to insert" es dejarle instrucciones para reabrir el agujero
 * que este guard acaba de cerrar. `removeDangerousPolicies` ahora se lleva,
 * junto con la política, el bloque de comentarios `--` pegado
 * INMEDIATAMENTE encima (sin línea en blanco de por medio) y colapsa a lo
 * sumo una línea en blanco en la costura — conservador a propósito: sólo
 * toca lo pegado a la política que elimina, nunca la cabecera del archivo ni
 * un comentario separado por una línea en blanco.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * migrationGate.js, migrationPath.js y planGuard.js. El tipado vive en
 * rlsPolicyGuard.d.ts.
 */

/**
 * Set cerrado de nombres de columna que marcan una tabla como "de rol o
 * permisos". Congelado y exportado: es la única superficie de configuración
 * de qué cuenta como columna de rol, documentada aquí y en ningún otro sitio.
 */
export const ROLE_COLUMN_NAMES = Object.freeze([
  'role',
  'roles',
  'is_admin',
  'permissions',
  'permission',
  'user_role',
]);

const ROLE_COLUMN_SET = new Set(ROLE_COLUMN_NAMES);

/** Palabras clave de restricción de tabla, no de columna: no cuentan como columna. */
const TABLE_CONSTRAINT_KEYWORDS = new Set([
  'constraint',
  'primary',
  'foreign',
  'unique',
  'check',
  'exclude',
  'like',
]);

/**
 * BLOQUE 1-BIS — lista de PERMITIDOS, no de prohibidos. La única operación
 * pública aceptable sobre una tabla con columna de rol es SELECT; cualquier
 * otra (`DELETE` incluido — el caso real que motivó la inversión) cae. Ver
 * la cabecera del módulo.
 */
const ALLOWED_PUBLIC_COMMANDS = new Set(['SELECT']);

/** Roles que cuentan como "público/anónimo" para efectos de esta guarda. */
const PUBLIC_ROLES = new Set(['public', 'anon']);

/**
 * Un identificador SQL, listo para COMPARAR: comillas dobles fuera,
 * calificación de esquema (`public.app_users` → `app_users`) fuera,
 * minúsculas. Se usa SÓLO para comparar contra el set cerrado o entre sí —
 * nunca para mostrarlo al usuario.
 *
 * @param {unknown} raw
 * @returns {string} '' cuando no hay nada comparable.
 */
function normalizeIdentifier(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  const parts = s.split('.');
  s = parts[parts.length - 1].trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
  return s.toLowerCase();
}

/**
 * El mismo identificador, para MOSTRAR: comillas y calificación de esquema
 * fuera, pero el case tal como lo escribió el modelo. Es lo que viaja al
 * aviso del usuario ("Política de escritura pública sobre <tabla>").
 *
 * @param {unknown} raw
 * @returns {string}
 */
function displayIdentifier(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  const parts = s.split('.');
  s = parts[parts.length - 1].trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
  return s;
}

/**
 * El bloque `(...)` que arranca en `text[openIndex]` (que debe ser `(`),
 * respetando paréntesis anidados (tipos como `varchar(255)`, `CHECK(...)`).
 * No sabe de literales de cadena con paréntesis dentro — heurística, como el
 * resto de este módulo — pero eso sólo afecta a un `DEFAULT` con un paréntesis
 * suelto dentro de una comilla, caso que no aparece en el DDL de columnas de
 * rol que esta guarda necesita leer.
 *
 * @param {string} text
 * @param {number} openIndex
 * @returns {{ body: string, end: number } | null} null si el paréntesis nunca cierra.
 */
function extractParenBody(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { body: text.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

/**
 * Divide el cuerpo de un `CREATE TABLE (...)` por comas de nivel superior
 * (fuera de cualquier paréntesis anidado), que es como Postgres separa
 * columnas y restricciones de tabla entre sí.
 *
 * @param {string} body
 * @returns {string[]}
 */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

/**
 * ¿Alguna de las columnas declaradas en este cuerpo de `CREATE TABLE` es una
 * columna de rol? Compara el PRIMER token de cada segmento de nivel superior
 * (el nombre de columna, o una palabra clave de restricción de tabla que se
 * descarta) contra `ROLE_COLUMN_SET`, por igualdad completa.
 *
 * @param {string} body
 * @returns {boolean}
 */
function tableBodyHasRoleColumn(body) {
  for (const raw of splitTopLevel(body)) {
    const seg = raw.trim();
    if (seg.length === 0) continue;
    const m = /^("[^"]+"|[\w$]+)/.exec(seg);
    if (!m) continue;
    const first = normalizeIdentifier(m[1]);
    if (TABLE_CONSTRAINT_KEYWORDS.has(first)) continue;
    if (ROLE_COLUMN_SET.has(first)) return true;
  }
  return false;
}

const CREATE_TABLE_RE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[\w.]+)\s*\(/gi;
const ALTER_ADD_COLUMN_RE =
  /\balter\s+table\s+(?:if\s+exists\s+)?("[^"]+"|[\w.]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[\w.]+)/gi;

/**
 * Las tablas (normalizadas) que este texto SQL declara con una columna de
 * rol, vía `CREATE TABLE (...)` o `ALTER TABLE ... ADD COLUMN`.
 *
 * @param {string} sql
 * @returns {Set<string>}
 */
function tablesWithRoleColumnInSql(sql) {
  const found = new Set();

  CREATE_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_RE.exec(sql))) {
    const openIndex = m.index + m[0].length - 1;
    const block = extractParenBody(sql, openIndex);
    if (!block) continue;
    if (tableBodyHasRoleColumn(block.body)) found.add(normalizeIdentifier(m[1]));
  }

  ALTER_ADD_COLUMN_RE.lastIndex = 0;
  while ((m = ALTER_ADD_COLUMN_RE.exec(sql))) {
    const column = normalizeIdentifier(m[2]);
    if (ROLE_COLUMN_SET.has(column)) found.add(normalizeIdentifier(m[1]));
  }

  return found;
}

// Heurístico a propósito: se detiene en el primer `;` tras `CREATE POLICY ...
// ON <tabla>`, que es donde termina la sentencia en cualquier migración
// generada por este pipeline (una expresión USING/WITH CHECK con un `;`
// dentro de un literal de cadena no aparece en el corpus que esta guarda
// vigila). Fallar cerrado sobre ESE caso límite no está cubierto — se acepta
// como el mismo tipo de heurística que ya usa `misplacedMigrations`.
const CREATE_POLICY_RE = /\bcreate\s+policy\s+("[^"]+"|[\w$]+)\s+on\s+("[^"]+"|[\w.]+)([\s\S]*?);/gi;

/**
 * El comando (`INSERT` | `UPDATE` | `ALL` | `SELECT` | `DELETE`) que declara
 * la cláusula `FOR` de una política. Ausente, Postgres asume `ALL` — y por
 * eso ausente también cuenta como `ALL` aquí.
 *
 * @param {string} tail
 * @returns {string}
 */
function parseCommand(tail) {
  const m = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(tail);
  return m ? m[1].toUpperCase() : 'ALL';
}

/**
 * Los roles (normalizados) de la cláusula `TO` de una política. Sin `TO`,
 * Postgres asigna la política a PUBLIC — ausencia de restricción es
 * exactamente la misma cosa que `TO public`, y así se modela.
 *
 * @param {string} tail
 * @returns {string[]}
 */
function parseRoles(tail) {
  const m = /\bto\s+([\s\S]*?)(?:\busing\b|\bwith\s+check\b|$)/i.exec(tail);
  if (!m) return ['public'];
  return m[1]
    .split(',')
    .map((r) => normalizeIdentifier(r))
    .filter((r) => r.length > 0);
}

/**
 * Las políticas `CREATE POLICY` de un texto SQL, ya interpretadas (tabla,
 * nombre, comando, roles) y con el `statement` exacto que las produjo — el
 * texto que `removeDangerousPolicies` necesita para borrarlas sin tocar el
 * resto del archivo.
 *
 * @param {string} sql
 * @returns {{ tableDisplay: string, tableNorm: string, policy: string, command: string, roles: string[], statement: string }[]}
 */
function findPoliciesInSql(sql) {
  const out = [];
  CREATE_POLICY_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_POLICY_RE.exec(sql))) {
    const tail = m[3];
    out.push({
      tableDisplay: displayIdentifier(m[2]),
      tableNorm: normalizeIdentifier(m[2]),
      policy: displayIdentifier(m[1]),
      command: parseCommand(tail),
      roles: parseRoles(tail),
      statement: m[0],
    });
  }
  return out;
}

/**
 * Evalúa un lote de migraciones (el mismo lote que un intent va a proponer
 * junto) y devuelve el veredicto completo.
 *
 * El set de "tablas con columna de rol" se construye sobre la UNIÓN de todo
 * el lote, no archivo por archivo: una migración puede crear la tabla y otra,
 * en el mismo intent, añadir la política — el guard tiene que ver las dos a
 * la vez para no dejar pasar exactamente el caso que existe para atrapar.
 *
 * @param {Iterable<{ path: string, sql: unknown }>} migrations
 * @returns {{ dangerous: boolean, findings: object[] }}
 */
export function evaluateRlsPolicies(migrations) {
  const list = [];
  for (const entry of migrations ?? []) {
    if (entry === null || typeof entry !== 'object') continue;
    list.push({
      path: typeof entry.path === 'string' ? entry.path : '',
      sql: entry.sql,
    });
  }

  const findings = [];
  const readable = [];
  for (const { path, sql } of list) {
    if (typeof sql !== 'string' || sql.trim().length === 0) {
      findings.push({
        path,
        table: null,
        policy: null,
        command: null,
        statement: null,
        reason: 'unparseable',
      });
      continue;
    }
    readable.push({ path, sql });
  }

  const roleTables = new Set();
  for (const { sql } of readable) {
    for (const table of tablesWithRoleColumnInSql(sql)) roleTables.add(table);
  }

  for (const { path, sql } of readable) {
    for (const policy of findPoliciesInSql(sql)) {
      const isPublicRole = policy.roles.some((r) => PUBLIC_ROLES.has(r));
      // BLOQUE 1-BIS: peligroso es "no está en la lista de permitidos", no
      // "está en la lista de prohibidos" — así DELETE (y cualquier forma
      // futura) cae sin que nadie tenga que enumerarla.
      const isDisallowedCommand = !ALLOWED_PUBLIC_COMMANDS.has(policy.command);
      const tableHasRole = roleTables.has(policy.tableNorm);
      if (isPublicRole && isDisallowedCommand && tableHasRole) {
        findings.push({
          path,
          table: policy.tableDisplay,
          policy: policy.policy,
          command: policy.command,
          statement: policy.statement,
          reason: 'public-write-policy',
        });
      }
    }
  }

  return { dangerous: findings.length > 0, findings };
}

/**
 * Elimina, de un texto SQL, la sentencia que empieza en `statementIndex` (de
 * `statementLength` caracteres) Y el bloque de comentarios `--` pegado
 * INMEDIATAMENTE encima —sin línea en blanco de por medio—, colapsando a lo
 * sumo una línea en blanco en la costura que deja la eliminación.
 *
 * Conservador a propósito (BLOQUE 1-BIS, CAMBIO 2): sólo se lleva el
 * comentario directamente pegado a ESTA política. Una línea en blanco entre
 * el comentario y la política corta la cadena — ese comentario no es de
 * esta política y se queda. No toca nada más del archivo: ni la cabecera, ni
 * comentarios de otras políticas, ni el formato del resto del SQL.
 *
 * @param {string} text
 * @param {number} statementIndex
 * @param {number} statementLength
 * @returns {string}
 */
function removeStatementAndAdjacentComment(text, statementIndex, statementLength) {
  const lines = text.split('\n');
  const startLine = text.slice(0, statementIndex).split('\n').length - 1;
  const statementText = text.slice(statementIndex, statementIndex + statementLength);
  const endLine = startLine + statementText.split('\n').length - 1;

  // Camina hacia arriba mientras cada línea sea un comentario `--`: una línea
  // en blanco o de código corta la cadena de inmediato, que es justo "sin
  // línea en blanco de por medio".
  let firstLine = startLine;
  let j = startLine - 1;
  while (j >= 0 && lines[j].trim().startsWith('--')) {
    firstLine = j;
    j--;
  }

  const before = lines.slice(0, firstLine);
  const after = lines.slice(endLine + 1);

  // La costura puede dejar dos líneas en blanco pegadas (la que cerraba el
  // bloque anterior y la que abría el siguiente): colapsa a lo sumo una.
  while (
    before.length > 0 &&
    after.length > 0 &&
    before[before.length - 1].trim() === '' &&
    after[0].trim() === ''
  ) {
    after.shift();
  }

  return [...before, ...after].join('\n');
}

/**
 * El SQL de UN archivo con los `findings` (de ESE mismo `path`) eliminados —
 * cada sentencia `CREATE POLICY ...;` completa, junto con el comentario `--`
 * pegado encima si lo tiene, fuera; nada más tocado.
 *
 * Idempotente: un `finding` cuyo `statement` ya no está presente (porque ya
 * se eliminó en una pasada anterior) simplemente no encuentra nada que
 * reemplazar. Los hallazgos `reason: 'unparseable'` no traen `statement`
 * (no hubo nada legible que localizar) y se ignoran aquí a propósito: no hay
 * texto que borrar de un archivo que no se pudo leer.
 *
 * Los índices se recalculan en cada iteración sobre el texto YA actualizado
 * (`out`, no el original): un `finding` que ya se aplicó, o una eliminación
 * previa que desplazó el resto del archivo, nunca puede pisar contenido que
 * ya cambió de sitio.
 *
 * @param {string} sql
 * @param {Iterable<{ statement: string | null }>} findings
 * @returns {string}
 */
export function removeDangerousPolicies(sql, findings) {
  if (typeof sql !== 'string') return sql;
  let out = sql;
  for (const finding of findings ?? []) {
    const statement = finding?.statement;
    if (typeof statement !== 'string' || statement.length === 0) continue;
    const idx = out.indexOf(statement);
    if (idx === -1) continue;
    out = removeStatementAndAdjacentComment(out, idx, statement.length);
  }
  return out;
}

/**
 * Sufijo de telemetría para forge_intent_log: mismo mecanismo que
 * [DDL_PROPOSED:...] y [PLAN_REPAIRED:...] — espacio delante, contenido entre
 * corchetes, cadena vacía cuando no hubo nada que bloquear. Sólo cuenta
 * `reason: 'public-write-policy'`: un `unparseable` no tiene tabla/política
 * que nombrar en la marca.
 *
 * Ordenado y deduplicado, igual que `planRepairedTelemetry`: comparable entre
 * filas, no un reflejo del orden de descubrimiento.
 *
 * @param {Iterable<{ table: string | null, policy: string | null, reason: string }>} findings
 * @returns {string}
 */
export function rlsPolicyBlockedTelemetry(findings) {
  const entries = [];
  for (const f of findings ?? []) {
    if (!f || f.reason !== 'public-write-policy') continue;
    if (typeof f.table !== 'string' || f.table.length === 0) continue;
    entries.push(`${f.table}:${f.policy ?? ''}`);
  }
  if (entries.length === 0) return '';
  return ` [RLS_POLICY_BLOCKED:${[...new Set(entries)].sort().join(',')}]`;
}

/**
 * Los avisos, en el texto acordado, uno por tabla distinta afectada
 * (deduplicado, en el orden en que se descubrieron). `<tabla>` y la lista de
 * operaciones son las únicas sustituciones — el resto es literal.
 *
 * BLOQUE 1-BIS: con la lista de permitidos el guard puede eliminar varias
 * políticas de tipos distintos sobre la misma tabla en un solo intent (el
 * caso real: INSERT, UPDATE y DELETE a la vez), así que el aviso nombra QUÉ
 * operaciones se eliminaron — ordenadas y deduplicadas, comparables entre
 * avisos igual que la telemetría — en vez de callar el detalle.
 *
 * Sólo `reason: 'public-write-policy'` produce aviso: un hallazgo
 * `unparseable` no tiene tabla ni comando que nombrar en esta frase.
 *
 * @param {Iterable<{ table: string | null, command: string | null, reason: string }>} findings
 * @returns {string[]}
 */
export function rlsPolicyWarnings(findings) {
  const order = [];
  const commandsByTable = new Map();
  for (const f of findings ?? []) {
    if (!f || f.reason !== 'public-write-policy') continue;
    if (typeof f.table !== 'string' || f.table.length === 0) continue;
    if (!commandsByTable.has(f.table)) {
      commandsByTable.set(f.table, new Set());
      order.push(f.table);
    }
    if (typeof f.command === 'string' && f.command.length > 0) {
      commandsByTable.get(f.table).add(f.command);
    }
  }
  return order.map((table) => {
    const ops = [...commandsByTable.get(table)].sort().join(', ');
    return (
      'Guard de seguridad: se corrigió la migración generada. Política(s) pública(s) de ' +
      `${ops} sobre ${table} (tabla con columna de rol). Eliminada(s) antes de proponer la ` +
      'migración. La gestión de usuarios sigue por la función de servidor correspondiente.'
    );
  });
}
