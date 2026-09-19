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
