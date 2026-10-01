// ---------------------------------------------------------------------------
// securityCheck — el agente de seguridad, fase 1 / S1 (2026-10-01, decisiones
// de Samuel): revisa la BASE REAL del proyecto (no los .sql, que pueden no
// coincidir con lo aplicado) y el código, con reglas fijas, sin IA y sin
// costo. Sólo LEE: una única consulta SELECT vía la Management API.
//
// Gravedad (decisión 3A): lo "grave" bloqueará Publicar (S3); lo demás avisa.
// ---------------------------------------------------------------------------
import { evaluateClientCode } from '../src/utils/clientCodeGuard.js';
// Datos personales o secretos: leerlos "para cualquiera" es grave. Misma
// regla que la guardia de migraciones nuevas (piiPublicGuard.js).
import { PII_COLUMN } from '../src/utils/piiPublicGuard.js';

/** Una sola consulta de lectura: tablas (RLS), políticas y columnas de `public`. */
export const SECURITY_REPORT_SQL = `
select json_build_object(
  'tables', (
    select coalesce(json_agg(json_build_object('name', c.relname, 'rls', c.relrowsecurity)), '[]'::json)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  'policies', (
    select coalesce(json_agg(json_build_object(
      'table', tablename, 'name', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual, 'check', with_check
    )), '[]'::json)
    from pg_policies where schemaname = 'public'
  ),
  'columns', (
    select coalesce(json_agg(json_build_object('table', table_name, 'column', column_name)), '[]'::json)
    from information_schema.columns where table_schema = 'public'
  )
) as report;
`.trim();

/** Ejecuta SECURITY_REPORT_SQL contra el proyecto `ref`. Lanza si la API falla. */
export async function fetchSecurityReport(ref, managementToken, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${managementToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SECURITY_REPORT_SQL }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Management API ${response.status}: ${raw.slice(0, 200)}`);
  const rows = JSON.parse(raw);
  const report = Array.isArray(rows) ? rows[0]?.report : rows?.report;
  if (!report || typeof report !== 'object') throw new Error('respuesta sin "report"');
  return report;
}

// Columnas que deciden privilegios o estado: insertar "para cualquiera" se salta controles.
const PRIVILEGED_COLUMN = /^(status|estado|role|rol|roles|is_admin|admin|approved|aprobad[oa]|is_active|activo|verified|verificad[oa]|moderated_at)$/i;
const PUBLIC_ROLES = new Set(['public', 'anon']);
const OPEN_EXPR = /^\(?\s*true\s*\)?$/i;

const isPublic = (roles) => (Array.isArray(roles) ? roles : String(roles ?? '').replace(/[{}]/g, '').split(','))
  .map((r) => String(r).trim().toLowerCase())
  .some((r) => PUBLIC_ROLES.has(r));
const isOpen = (expr) => expr == null || OPEN_EXPR.test(String(expr).trim());

/**
 * @param {{ tables?: {name: string, rls: boolean}[], policies?: object[], columns?: {table: string, column: string}[] }} report
 * @returns {{ severity: 'grave' | 'aviso', kind: string, table?: string, policy?: string, columns?: string[] }[]}
 */
export function evaluateDatabase(report) {
  const findings = [];
  const columnsOf = new Map();
  for (const c of report?.columns ?? []) {
    if (!columnsOf.has(c.table)) columnsOf.set(c.table, []);
    columnsOf.get(c.table).push(c.column);
  }
  for (const t of report?.tables ?? []) {
    if (t.rls === false) findings.push({ severity: 'grave', kind: 'rls_off', table: t.name });
  }
  for (const p of report?.policies ?? []) {
    if (!isPublic(p.roles)) continue;
    const cmd = String(p.cmd ?? '').toUpperCase();
    const cols = columnsOf.get(p.table) ?? [];
    if (['UPDATE', 'DELETE', 'ALL'].includes(cmd) && isOpen(p.qual)) {
      findings.push({ severity: 'grave', kind: 'public_write', table: p.table, policy: p.name, cmd });
      continue;
    }
    if (['SELECT', 'ALL'].includes(cmd) && isOpen(p.qual)) {
      const pii = cols.filter((c) => PII_COLUMN.test(c));
      if (pii.length > 0) findings.push({ severity: 'grave', kind: 'public_pii_read', table: p.table, policy: p.name, columns: pii });
    }
    if (cmd === 'INSERT' && isOpen(p.check)) {
      const privileged = cols.filter((c) => PRIVILEGED_COLUMN.test(c));
      if (privileged.length > 0) findings.push({ severity: 'aviso', kind: 'public_insert_privileged', table: p.table, policy: p.name, columns: privileged });
    }
  }
  return findings;
}

const SERVICE_ROLE_USE = /SUPABASE_SERVICE_ROLE_KEY|service_role/;
// Imports por URL que el bundler de Supabase rechaza (la función no se instala).
const BAD_EDGE_IMPORT = /from\s+['"]https?:\/\/(?:deno\.land\/x|cdn\.skypack\.dev|esm\.sh)\//;
const CALLER_CHECK = /auth\.getUser\s*\(|getClaims\s*\(|jwtVerify\s*\(|createRemoteJWKSet\s*\(/;

/**
 * @param {{ path: string, content: string }[]} files
 * @param {Set<string>} roleTables tablas con columna de rol (de la base real)
 */
export function evaluateCode(files, roleTables = new Set()) {
  const findings = [];
  const client = (files ?? []).filter((f) => typeof f?.path === 'string' && f.path.startsWith('src/'));
  for (const f of evaluateClientCode(client, roleTables).findings) {
    findings.push(f.reason === 'hardcoded-credential'
      ? { severity: 'grave', kind: 'client_secret', path: f.path, identifier: f.identifier }
      : { severity: 'grave', kind: 'client_role_write', path: f.path, table: f.table });
  }
  for (const f of files ?? []) {
    if (!/^supabase\/functions\/[^/]+\/index\.ts$/.test(f?.path ?? '') || typeof f.content !== 'string') continue;
    if (SERVICE_ROLE_USE.test(f.content) && !CALLER_CHECK.test(f.content)) {
      findings.push({ severity: 'aviso', kind: 'edge_no_caller_check', path: f.path });
    }
    if (BAD_EDGE_IMPORT.test(f.content)) {
      findings.push({ severity: 'aviso', kind: 'edge_bad_import', path: f.path });
    }
  }
  return findings;
}

/** Une los dos lados; lo grave primero. */
export function runSecurityCheck({ report, files }) {
  const roleTables = new Set(
    (report?.columns ?? []).filter((c) => /^(role|rol|roles)$/i.test(c.column)).map((c) => String(c.table).toLowerCase())
  );
  const findings = [...(report ? evaluateDatabase(report) : []), ...evaluateCode(files, roleTables)];
  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'grave' ? -1 : 1));
}
