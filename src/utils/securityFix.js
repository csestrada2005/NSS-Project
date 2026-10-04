// ---------------------------------------------------------------------------
// securityFix — el "Arreglar" del agente de seguridad (S2, 2026-10-01) y la
// huella de archivos que dice si un chequeo guardado quedó viejo.
//
// El pedido empieza con una frase fija (i18n `security.fixPrompt`) para que el
// orquestador lo reconozca (isSecurityFixRequest): nunca se contesta como
// pregunta, no cae en el atajo "compila, no hay nada que arreglar" y va al
// plan lane, igual que "Arreglar ahora" de tipos.
// ---------------------------------------------------------------------------

const SECURITY_FIX_REQUEST =
  /^(?:Fix these security issues in the project|Arregla estos problemas de seguridad del proyecto)/;

/** ¿Es el pedido que arma el botón "Arreglar" de Seguridad? */
export function isSecurityFixRequest(prompt) {
  return typeof prompt === 'string' && SECURITY_FIX_REQUEST.test(prompt);
}

const q = (s) => `"${String(s ?? '')}"`;

/** Instrucción concreta, en inglés (para el modelo), por tipo de hallazgo. */
export function findingInstruction(f) {
  const cols = (f.columns ?? []).join(', ');
  switch (f.kind) {
    case 'public_pii_read':
      return `- Table ${q(f.table)}: policy ${q(f.policy)} lets ANYONE (anon) read personal columns (${cols}). In a NEW migration, drop that policy. If the site must show part of this table publicly, create a view with only the non-personal columns, grant select on the view to anon, and make the page read from the view.`;
    case 'public_write':
      return `- Table ${q(f.table)}: policy ${q(f.policy)} lets ANYONE ${f.cmd ?? 'change'} rows. In a NEW migration, drop it. If the site needs that action, allow it only to authenticated users on their own rows, or move it to an Edge Function that verifies the caller.`;
    case 'rls_off':
      return `- Table ${q(f.table)} has row level security DISABLED. In a NEW migration, enable RLS on it and add only the policies the site needs (public read only for non-personal data).`;
    case 'public_insert_privileged':
      return `- Table ${q(f.table)}: policy ${q(f.policy)} lets ANYONE insert rows choosing ${cols}. In a NEW migration, restrict it so those columns can only take their safe default (for example with check (status = 'pending')), or drop the public insert.`;
    case 'client_secret':
      return `- File ${f.path} contains a secret key in browser code${f.identifier ? ` (${f.identifier})` : ''}. Remove it from the browser. Anything that needed it must go through a Supabase Edge Function that verifies the caller.`;
    case 'client_role_write':
      return `- File ${f.path} writes roles in table ${q(f.table)} from the browser. Remove that write; role changes must go through an Edge Function that verifies the caller is an admin.`;
    case 'edge_no_caller_check':
      return `- Edge Function ${f.path} uses the service role without verifying who calls it. Read the Authorization header, verify the user with supabase.auth.getUser(token), check their role in the roles table, and reply 401/403 otherwise.`;
    case 'auth_pii_read':
      return `- Table ${q(f.table)}: policy ${q(f.policy)} lets ANY logged-in user (clients included) read personal columns (${cols}) of every row. In a NEW migration, drop it. Admins read this data through an Edge Function that verifies their role; each user may read only their own rows with a policy like using (auth.uid() = user_id).`;
    case 'auth_write':
      return `- Table ${q(f.table)}: policy ${q(f.policy)} lets ANY logged-in user (clients included) ${f.cmd ?? 'change'} every row. In a NEW migration, drop it; allow it only on the user's own rows (using (auth.uid() = user_id)) or move it to an Edge Function that verifies the admin role.`;
    case 'edge_bad_import':
      return `- Edge Function ${f.path} imports from a URL Supabase rejects (deno.land/x, skypack or esm.sh), so it is never deployed. Rewrite its imports with npm: or jsr: specifiers (e.g. npm:@supabase/supabase-js@2).`;
    default:
      return `- ${f.kind}: ${f.table ?? f.path ?? ''}`;
  }
}

/**
 * @param {{ kind: string }[]} findings
 * @param {(key: string, params: object) => string} t  traductor (`security.fixPrompt`)
 */
export function buildSecurityFixPrompt(findings, t) {
  const list = (findings ?? []).map(findingInstruction).join('\n');
  return (
    t('security.fixPrompt', { list }) +
    '\n\nRules: never edit a migration file that is already applied; put ALL database changes in ONE new migration under supabase/migrations/. ' +
    'Do not remove any feature the site shows: keep public what is public and non-personal.'
  );
}

/**
 * Huella de los archivos del proyecto: cambia si cambia cualquier archivo.
 * Sirve para avisar que un chequeo guardado es anterior a los últimos cambios.
 *
 * @param {Map<string, string> | Iterable<[string, string]>} files
 */
export function filesFingerprint(files) {
  const entries = [...(files ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let h = 5381;
  let length = 0;
  for (const [path, content] of entries) {
    const chunk = `${path}\u0000${content}\u0001`;
    length += chunk.length;
    for (let i = 0; i < chunk.length; i++) h = ((h << 5) + h + chunk.charCodeAt(i)) | 0;
  }
  return `${entries.length}:${length}:${h >>> 0}`;
}
