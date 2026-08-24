/**
 * ddlGuard — detector DETERMINISTA de DDL destructivo en un texto SQL.
 *
 * POR QUÉ EXISTE, Y POR QUÉ NADIE LO LLAMA TODAVÍA
 * ------------------------------------------------
 * El cable de migraciones (MigrationRunner) aplica el SQL que el pipeline
 * generó contra la base del proyecto GENERADO. Aplicar es irreversible: un
 * `DROP TABLE users` no tiene deshacer. La aprobación humana explícita —el
 * botón del modal— llega en Cirugía 2, y ese botón necesita saber ANTES de
 * pintarse si lo que va a correr borra datos, para pedir una confirmación
 * distinta (roja, con el nombre de la tabla escrito a mano) en vez del "Aplicar"
 * normal.
 *
 * Este módulo se escribe AHORA, con tests, y SIN consumidor: la UI de Cirugía 2
 * se monta sobre lógica ya verde en vez de nacer con su propio detector sin
 * probar. `grep -rn "ddlGuard" src/` devuelve exactamente este archivo, su .d.ts
 * y su test — eso es intencional, no un olvido.
 *
 * QUÉ CUENTA COMO DESTRUCTIVO (la lista es la del encargo, ni más ni menos)
 *  - DROP ...            → borra el objeto entero (tabla, vista, tipo, índice…).
 *  - TRUNCATE ...        → vacía la tabla; no hay WHERE que lo acote.
 *  - DELETE sin WHERE    → borra TODAS las filas. Con WHERE no dispara: acotar
 *                          el borrado es justo lo que distingue un cleanup de
 *                          una catástrofe.
 *  - ALTER ... DROP COLUMN → la columna y su contenido se van con ella.
 *
 * QUÉ NO CUENTA (y por qué)
 *  - CREATE / ALTER ... ADD COLUMN / INSERT / UPDATE: no destruyen datos
 *    existentes por sí mismos. UPDATE sin WHERE los reescribe, pero el encargo
 *    no lo lista y ampliar la definición aquí sería inventar política.
 *  - ALTER ... DROP DEFAULT / DROP NOT NULL / DROP CONSTRAINT: quitan una
 *    restricción, no la columna ni sus filas.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * deletionGuard.js, danglingRefs.js e importGraph.js. El tipado vive en
 * ddlGuard.d.ts.
 */

/** Tipos de hallazgo. Strings estables: la UI de Cirugía 2 los va a rotular. */
export const DROP = 'drop';
export const TRUNCATE = 'truncate';
export const DELETE_WITHOUT_WHERE = 'delete_without_where';
export const DROP_COLUMN = 'drop_column';

/**
 * Enmascara comentarios y literales de un texto SQL preservando LONGITUD y
 * saltos de línea, para que los offsets y los números de línea calculados sobre
 * la máscara sigan valiendo sobre el original.
 *
 * Cubre lo que Postgres acepta de verdad:
 *  - `-- …` hasta fin de línea.
 *  - `/* … *​/` con ANIDAMIENTO (Postgres los anida; C no).
 *  - `'…'` con `''` como escape del apóstrofo.
 *  - `"…"` identificadores citados (una tabla puede llamarse "drop table").
 *  - `$tag$ … $tag$` dollar-quoting, el cuerpo típico de una función plpgsql.
 *    Sin esto, un `DROP TABLE` citado DENTRO del cuerpo de una función dispara
 *    un falso positivo.
 *
 * @param {string} sql
 * @returns {string} misma longitud que `sql`
 */
export function maskSqlNoise(sql) {
  const src = String(sql ?? '');
  const out = src.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);

    if (two === '--') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      blank(i, j);
      i = j;
      continue;
    }

    if (two === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < src.length && depth > 0) {
        if (src.slice(j, j + 2) === '/*') { depth++; j += 2; continue; }
        if (src.slice(j, j + 2) === '*/') { depth--; j += 2; continue; }
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }

    if (src[i] === "'" || src[i] === '"') {
      const q = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === q) {
          if (src[j + 1] === q) { j += 2; continue; } // '' / "" escapado
          j++;
          break;
        }
        j++;
      }
      blank(i + 1, j - 1 >= i + 1 ? j - 1 : i + 1);
      i = j;
      continue;
    }

    if (src[i] === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(src.slice(i));
      if (tag) {
        const open = tag[0];
        const close = src.indexOf(open, i + open.length);
        const end = close === -1 ? src.length : close + open.length;
        blank(i + open.length, close === -1 ? end : close);
        i = end;
        continue;
      }
    }

    i++;
  }

  return out.join('');
}

/**
 * Parte el SQL en sentencias por `;` de nivel superior. El corte se decide
 * SOBRE LA MÁSCARA (un `;` dentro de un literal o de un cuerpo `$$ … $$` no
 * separa nada) y cada sentencia se devuelve con su texto original y su offset,
 * para poder reportar la línea real.
 *
 * @param {string} sql
 * @returns {{ text: string, masked: string, offset: number }[]}
 */
export function splitStatements(sql) {
  const src = String(sql ?? '');
  const masked = maskSqlNoise(src);
  const statements = [];
  let start = 0;

  // Los bordes se recortan sobre la MÁSCARA, no sobre el original: un
  // comentario delante de la sentencia (`-- limpieza\ndrop table b;`) es
  // espacio en blanco en la máscara, así que recortarlo ahí deja `offset`
  // apuntando al VERBO real y la línea reportada es la del DROP, no la del
  // comentario que lo precede.
  const push = (from, to) => {
    const window = masked.slice(from, to);
    if (window.trim().length === 0) return;
    const lead = window.length - window.replace(/^\s+/, '').length;
    const trail = window.length - window.replace(/\s+$/, '').length;
    statements.push({
      text: src.slice(from + lead, to - trail),
      masked: masked.slice(from + lead, to - trail),
      offset: from + lead,
    });
  };

  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ';') {
      push(start, i);
      start = i + 1;
    }
  }
  push(start, src.length);

  return statements;
}

/** Número de línea (1-based) del offset dentro del texto. */
function lineAt(sql, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < sql.length; i++) {
    if (sql[i] === '\n') line++;
  }
  return line;
}

/** Recorta una sentencia para que quepa en un mensaje o en telemetría. */
function preview(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

// Sub-cláusulas de ALTER que empiezan por DROP y NO son un DROP COLUMN: quitan
// una restricción o un default, no la columna ni sus filas.
const ALTER_DROP_NON_COLUMN = /^(?:constraint|default|not\s+null|identity|expression|generated)\b/i;

/**
 * Hallazgos destructivos en un texto SQL. Determinista y sin red: mismo texto,
 * mismos hallazgos, en el mismo orden (por posición en el archivo).
 *
 * @param {string} sql
 * @returns {{ kind: string, statement: string, line: number, match: string }[]}
 */
export function findDestructiveDDL(sql) {
  const src = String(sql ?? '');
  const findings = [];

  for (const stmt of splitStatements(src)) {
    const m = stmt.masked;

    // DROP de nivel superior: el verbo con el que ARRANCA la sentencia. Un
    // `create table drop_log (…)` no dispara porque ahí `drop` no es el verbo.
    const drop = /^drop\s+/i.exec(m);
    if (drop) {
      findings.push({
        kind: DROP,
        statement: preview(stmt.text),
        line: lineAt(src, stmt.offset),
        match: preview(stmt.text.slice(0, 60)),
      });
      continue;
    }

    const truncate = /^truncate\b/i.exec(m);
    if (truncate) {
      findings.push({
        kind: TRUNCATE,
        statement: preview(stmt.text),
        line: lineAt(src, stmt.offset),
        match: preview(stmt.text.slice(0, 60)),
      });
      continue;
    }

    // DELETE sin WHERE. El WHERE se busca sobre la máscara: un `where` dentro
    // de un literal ('delete where') no acota nada.
    if (/^delete\s+from\b/i.test(m)) {
      if (!/\bwhere\b/i.test(m)) {
        findings.push({
          kind: DELETE_WITHOUT_WHERE,
          statement: preview(stmt.text),
          line: lineAt(src, stmt.offset),
          match: preview(stmt.text.slice(0, 60)),
        });
      }
      continue;
    }

    // ALTER … DROP COLUMN. `COLUMN` es opcional en Postgres
    // (`alter table t drop c`), así que la palabra clave no puede ser el
    // criterio: lo que descarta es la sub-cláusula que sigue al DROP.
    if (/^alter\s+/i.test(m)) {
      const re = /\bdrop\s+(?:column\s+)?(?:if\s+exists\s+)?/gi;
      let hit;
      while ((hit = re.exec(m)) !== null) {
        const rest = m.slice(hit.index + hit[0].length);
        const explicitColumn = /\bdrop\s+column\b/i.test(hit[0]);
        if (!explicitColumn && ALTER_DROP_NON_COLUMN.test(rest)) continue;
        findings.push({
          kind: DROP_COLUMN,
          statement: preview(stmt.text),
          line: lineAt(src, stmt.offset + hit.index),
          match: preview(`${hit[0]}${rest.slice(0, 40)}`),
        });
      }
    }
  }

  return findings;
}

/**
 * ¿El SQL contiene al menos una operación destructiva?
 *
 * @param {string} sql
 * @returns {boolean}
 */
export function isDestructiveDDL(sql) {
  return findDestructiveDDL(sql).length > 0;
}
