// ---------------------------------------------------------------------------
// vercelDeployUrl — qué dirección se entrega al publicar (2026-09-30).
// Vercel da dos: la de la versión (`nebu-<id>-6ro6goukl-nebu-studio.vercel.app`),
// que la protección del equipo pone detrás de "Log in to Vercel", y las del
// proyecto (alias de producción), públicas y fijas entre publicaciones.
// Check de Samuel: la del proyecto abre en incógnito sin login.
// ---------------------------------------------------------------------------

/**
 * @param {{ url?: string, alias?: unknown }} deployment  GET /v13/deployments/{id}
 * @returns {string | null}  URL https del alias de proyecto más corto, o null
 */
export function pickProjectUrl(deployment) {
  const own = typeof deployment?.url === 'string' ? deployment.url : '';
  const aliases = (Array.isArray(deployment?.alias) ? deployment.alias : [])
    .filter((a) => typeof a === 'string' && a && a !== own);
  if (aliases.length === 0) return null;
  const [best] = [...aliases].sort((a, b) => a.length - b.length || a.localeCompare(b));
  return `https://${best}`;
}
