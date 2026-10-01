// ---------------------------------------------------------------------------
// authSiteUrl — S5 del agente de seguridad (2026-10-01): al publicar, Supabase
// Auth del proyecto debe conocer el dominio del sitio (correos de confirmación
// y de recuperación apuntan ahí). Se fija `site_url` y se AÑADE el dominio a
// la lista de redirecciones permitidas, sin quitar las que ya hubiera.
// No bloquea la publicación: si falla, se registra y sigue.
// ---------------------------------------------------------------------------

/** Lista de redirecciones permitidas con `url` (y su comodín) añadidos una sola vez. */
export function mergeAllowList(current, url) {
  const items = String(current ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const add of [url, `${url}/**`]) {
    if (!items.includes(add)) items.push(add);
  }
  return items.join(',');
}

/**
 * @param {string} ref proyecto Supabase
 * @param {string} token Management API
 * @param {string} siteUrl https://… del sitio publicado (sin barra final)
 */
export async function configureAuthSiteUrl(ref, token, siteUrl, fetchImpl = fetch) {
  const url = String(siteUrl ?? '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(url)) throw new Error('site url inválida');
  const base = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const current = await fetchImpl(base, { headers });
  if (!current.ok) throw new Error(`GET config/auth ${current.status}`);
  const config = await current.json();
  const body = { site_url: url, uri_allow_list: mergeAllowList(config?.uri_allow_list, url) };
  const updated = await fetchImpl(base, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if (!updated.ok) throw new Error(`PATCH config/auth ${updated.status}`);
  return body;
}
