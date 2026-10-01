/**
 * deploySupabaseClient — cambia el cliente Supabase SOLO PREVIEW que
 * vendorea src/templates.ts (persistSession: false, autoRefreshToken:
 * false, lock no-op — obligatorio dentro del iframe del builder, origen
 * opaco sin `allow-same-origin`, ver StudioEngine.tsx) por un cliente de
 * producción con sesión real, ÚNICAMENTE en el paquete de archivos que se
 * manda a Vercel al publicar.
 *
 * EL AGUJERO QUE ESTO TAPA
 * ------------------------
 * `/api/deploy/:projectId` (server.js) reenvía a Vercel EXACTAMENTE los
 * `files` que llegan del cliente (DeployManager.tsx → PlatformService.
 * deployProject), sin transformar nada. El mismo archivo que el preview
 * necesita para no reventar con SecurityError en el iframe sandbox
 * terminaba publicado tal cual en el dominio real, donde esa restricción no
 * existe y sólo servía para impedir cualquier login/sesión de verdad.
 * Confirmado que el dominio publicado SÍ soporta sesión normal:
 * ClientProjectPage.tsx ya embebe `deployment_url` con
 * `sandbox="allow-scripts allow-same-origin"`.
 *
 * Bloque 1 de G-7 (ver QUEUE.md ítem 4) — la mitad de plomería del cierre
 * del hueco RLS ↔ Edge Function. El modelo puede generar login real
 * (Bloque 2, BACKEND_RULES) porque, a partir de este cambio, ese login SÍ
 * funciona una vez publicado — nunca dentro del editor.
 *
 * El servidor es la fuente de verdad para este ÚNICO archivo en el momento
 * de publicar, misma doctrina que el resto de esta familia de guards: si
 * `files` trae SUPABASE_CLIENT_PATH, su contenido se sobreescribe siempre,
 * sin excepción. El modelo nunca debe tocar este archivo
 * (REACT_TAILWIND_RULES: "already provided by the template"), así que su
 * contenido en `files` debería ser siempre el vendored intacto —
 * sobreescribirlo aquí de todas formas cierra cualquier deriva silenciosa
 * sin depender de que esa regla se respete.
 */

/** Ruta (tal como aparece en el mapa plano `files` del proyecto) del cliente Supabase vendored. */
export const SUPABASE_CLIENT_PATH = 'src/lib/supabase.ts';

/**
 * Cliente de producción: sin las tres banderas de modo preview. Un dominio
 * publicado no es un origen opaco — `persistSession`/`autoRefreshToken` por
 * defecto (true) y el `lock` real de GoTrueClient (`navigator.locks`)
 * funcionan sin problema ahí.
 */
export const PRODUCTION_SUPABASE_CLIENT_SOURCE = `
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
`.trim() + '\n';

/**
 * @param {Record<string, string> | null | undefined} files
 * @returns {Record<string, string> | null | undefined} una copia de `files` con
 *   SUPABASE_CLIENT_PATH reemplazado, o `files` sin tocar si esa ruta no
 *   está presente (p. ej. un proyecto sin base de datos provisionada).
 *   `files` nunca se muta.
 */
export function applyProductionSupabaseClient(files) {
  if (!files || typeof files !== 'object' || !(SUPABASE_CLIENT_PATH in files)) {
    return files;
  }
  return { ...files, [SUPABASE_CLIENT_PATH]: PRODUCTION_SUPABASE_CLIENT_SOURCE };
}

/** Archivo de entorno que `vite build` lee en Vercel (modo production). */
export const PRODUCTION_ENV_PATH = '.env.production';

const SAFE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const SAFE_KEY = /^[A-Za-z0-9._-]{20,}$/;

/**
 * Bloque 1b de G-7 (2026-10-01): el sitio PUBLICADO no recibía la dirección ni
 * la llave pública de su Supabase. En el preview las inyecta el compilador
 * (`define` en server/compiler.js); el paquete que va a Vercel no llevaba
 * nada, así que `src/lib/supabase.ts` arrancaba con `supabase = null` y todo
 * lo que lee o escribe datos estaba muerto en producción.
 *
 * Se añade `.env.production` con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
 * La llave anon está hecha para ir en el navegador (lo que protege los datos
 * es RLS). La service_role NUNCA pasa por aquí: sólo se aceptan una URL de
 * Supabase y una llave con forma de token, y sólo las de `credentials`.
 *
 * @param {Record<string, string> | null | undefined} files
 * @param {{ url?: string, anonKey?: string } | null | undefined} credentials
 * @returns copia de `files` con `.env.production`, o `files` sin tocar si no
 *   hay credenciales válidas (proyecto sin base de datos)
 */
export function withProductionSupabaseEnv(files, credentials) {
  if (!files || typeof files !== 'object') return files;
  const url = String(credentials?.url ?? '').trim().replace(/\/+$/, '');
  const anonKey = String(credentials?.anonKey ?? '').trim();
  if (!SAFE_URL.test(url) || !SAFE_KEY.test(anonKey)) return files;
  return {
    ...files,
    [PRODUCTION_ENV_PATH]: `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`,
  };
}
