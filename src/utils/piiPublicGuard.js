// ---------------------------------------------------------------------------
// piiPublicGuard — S5 del agente de seguridad (2026-10-01): una tabla con
// datos personales NUNCA queda legible para cualquiera, diga lo que diga la
// IA. Caso real: `newsletter_subscribers` salió con lectura pública de emails
// (`allow_public_select USING (true)`), y en septiembre `app_users` con
// `comment … 'wyrd:read=public'`. Guardia determinista sobre el SQL de las
// migraciones NUEVAS, antes de guardarlas: quita la marca de lectura pública y
// las políticas SELECT abiertas a anon/public de esas tablas.
// ---------------------------------------------------------------------------

/** Columnas con datos personales o secretos (misma regla que el chequeo de seguridad). */
export const PII_COLUMN = /(^|_)(e?mail|correo|phone|telefono|tel|mobile|movil|celular|whatsapp|address|direccion|domicilio|password|contrasena|token|secret|dni|ssn|rfc|curp|nif|birth|nacimiento|ip_address)(_|$)/i;

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([A-Za-z_]\w*)"?\s*\(([\s\S]*?)\)\s*;/gi;
const NOT_A_COLUMN = /^(constraint|primary|unique|foreign|check|exclude|like)$/i;

/** Tablas creadas en este SQL que tienen columnas personales → nombre: columnas. */
export function piiTablesInSql(sql) {
  const out = new Map();
  for (const m of String(sql ?? '').matchAll(CREATE_TABLE)) {
    const columns = m[2]
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0]?.replace(/"/g, '') ?? '')
      .filter((name) => name && !NOT_A_COLUMN.test(name));
    const pii = columns.filter((c) => PII_COLUMN.test(c));
    if (pii.length > 0) out.set(m[1].toLowerCase(), pii);
  }
  return out;
}

const ADD_COLUMN = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?public"?\.)?"?([A-Za-z_]\w*)"?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?([A-Za-z_]\w*)"?/gi;

/**
 * Tablas con columnas personales según TODAS las migraciones del proyecto
 * (2026-10-01: una migración que sólo re-abría `newsletter_subscribers`, creada
 * en otra migración, pasaba sin que la guardia supiera que tiene `email`).
 *
 * @param {Map<string, string> | Iterable<[string, string]>} files
 * @param {(path: string) => boolean} isMigration
 */
export function piiTablesInProject(files, isMigration) {
  const out = new Map();
  const add = (table, cols) => {
    const list = out.get(table) ?? [];
    for (const c of cols) if (!list.includes(c)) list.push(c);
    out.set(table, list);
  };
  for (const [path, sql] of files ?? []) {
    if (!isMigration(path) || typeof sql !== 'string') continue;
    for (const [table, cols] of piiTablesInSql(sql)) add(table, cols);
    for (const m of sql.matchAll(ADD_COLUMN)) {
      if (PII_COLUMN.test(m[2])) add(m[1].toLowerCase(), [m[2]]);
    }
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} sql
 * @param {Map<string, string[]>} [knownPii] tablas personales ya conocidas del proyecto
 * @returns {{ sql: string, tables: string[], details: { table: string, columns: string[] }[] }}
 *   SQL sin lectura pública en tablas con datos personales
 */
export function stripPiiPublicRead(sql, knownPii = new Map()) {
  let out = String(sql ?? '');
  const pii = new Map([...knownPii, ...piiTablesInSql(out)]);
  const details = [];
  for (const [table, columns] of pii) {
    const name = `(?:"?public"?\\.)?"?${escape(table)}"?`;
    const marker = new RegExp(`^[ \\t]*comment\\s+on\\s+table\\s+${name}\\s+is\\s+'[^']*wyrd:read=public[^']*'\\s*;[ \\t]*\\r?\\n?`, 'gim');
    const openSelect = new RegExp(
      `^[ \\t]*create\\s+policy\\s+(?:"[^"]*"|\\w+)\\s+on\\s+${name}\\s+for\\s+select\\s+(?:to\\s+(?:public|anon)(?:\\s*,\\s*\\w+)*\\s+)?using\\s*\\(\\s*true\\s*\\)\\s*;[ \\t]*\\r?\\n?`,
      'gim'
    );
    // Arquitectura de Nebu (Samuel, 2026-10-04): todo proyecto tiene panel de
    // admin con sesión y a veces panel de cliente con sesión, así que "cualquiera
    // con cuenta" incluye a los clientes. Leer TODOS los datos personales con
    // sólo tener sesión es una fuga: admins leen vía Edge Function que verifica
    // su rol; cada cliente, sus propias filas (auth.uid() = …), que no se tocan.
    const authOpenRead = new RegExp(
      `^[ \\t]*create\\s+policy\\s+(?:"[^"]*"|\\w+)\\s+on\\s+${name}\\s+for\\s+(?:select|all)\\s+to\\s+authenticated\\s+using\\s*\\(\\s*true\\s*\\)(?:\\s+with\\s+check\\s*\\(\\s*true\\s*\\))?\\s*;[ \\t]*\\r?\\n?`,
      'gim'
    );
    // "grant select … to anon[, authenticated]": se quita sólo anon.
    const grantAnon = new RegExp(`^([ \\t]*grant\\s+select\\s+on\\s+(?:table\\s+)?${name}\\s+to\\s+)([^;]*);[ \\t]*\\r?\\n?`, 'gim');
    let next = out.replace(marker, '').replace(openSelect, '').replace(authOpenRead, '');
    next = next.replace(grantAnon, (whole, head, roles) => {
      const kept = roles.split(',').map((r) => r.trim()).filter((r) => r && !/^(anon|public)$/i.test(r));
      return kept.length === roles.split(',').length ? whole : kept.length ? `${head}${kept.join(', ')};\n` : '';
    });
    if (next !== out) details.push({ table, columns });
    out = next;
  }
  return { sql: out, tables: details.map((d) => d.table), details };
}
