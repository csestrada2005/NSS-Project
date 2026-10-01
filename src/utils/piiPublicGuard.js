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

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} sql
 * @returns {{ sql: string, tables: string[] }} SQL sin lectura pública en tablas con datos personales
 */
export function stripPiiPublicRead(sql) {
  let out = String(sql ?? '');
  const touched = [];
  for (const table of piiTablesInSql(out).keys()) {
    const name = `(?:"?public"?\\.)?"?${escape(table)}"?`;
    const marker = new RegExp(`^[ \\t]*comment\\s+on\\s+table\\s+${name}\\s+is\\s+'[^']*wyrd:read=public[^']*'\\s*;[ \\t]*\\r?\\n?`, 'gim');
    const openSelect = new RegExp(
      `^[ \\t]*create\\s+policy\\s+(?:"[^"]*"|\\w+)\\s+on\\s+${name}\\s+for\\s+select\\s+(?:to\\s+(?:public|anon)(?:\\s*,\\s*\\w+)*\\s+)?using\\s*\\(\\s*true\\s*\\)\\s*;[ \\t]*\\r?\\n?`,
      'gim'
    );
    const next = out.replace(marker, '').replace(openSelect, '');
    if (next !== out) touched.push(table);
    out = next;
  }
  return { sql: out, tables: touched };
}
