/**
 * serverLogicSignals — cinturón DETERMINISTA e independiente del clasificador
 * (Haiku) para needs_server.
 *
 * POR QUÉ EXISTE
 * --------------
 * IntentClassifier.classify ya le pide al LLM que marque needs_server cuando
 * la petición necesita lógica que no puede vivir en el navegador. Pero un
 * LLM puede fallar (timeout, respuesta inválida, JSON.parse roto) y en ese
 * caso classify() devuelve DEFAULT_INTENT — needs_server=false sin haber
 * mirado el prompt. Este módulo es el cinturón que sigue funcionando aunque
 * Haiku muera: detecta por texto crudo las peticiones que casi con certeza
 * necesitan servidor, en español e inglés, sin llamar a ningún modelo.
 *
 * No sustituye al LLM — se suma con OR. El LLM puede detectar casos que el
 * cinturón no cubre (frases sin ninguna de estas palabras clave); el cinturón
 * cubre los casos obvios incluso cuando el LLM no respondió nada útil.
 */

const TRIGGERS = [
  // (1) roles/permisos/administración de usuarios
  'rol', 'roles', 'role',
  'admin', 'administrador',
  'permiso', 'permission',
  'invitar usuario', 'invite user',
  'dar de baja', 'deshabilitar', 'disable user',
  // (2) API keys de terceros
  'api key', 'clave de api',
  // (3) envío de email/notificaciones
  'enviar correo', 'enviar email', 'send email',
  // (4) agregación/resúmenes de datos almacenados
  'resumen mensual', 'monthly summary', 'reporte automático',
  // (5) moderación/filtrado de contenido
  'moderar', 'filtrar comentarios', 'moderate', 'profanity', 'spam filter',
];

/**
 * ¿El prompt crudo del usuario menciona, en español o inglés, alguno de los
 * disparadores deterministas de lógica de servidor?
 *
 * @param {unknown} prompt Texto crudo del usuario. Cualquier valor no-string
 *   (null, número, array...) es basura de entrada y se trata como "no hay
 *   señal" — no falla, no lanza.
 * @returns {boolean}
 */
export function promptNeedsServer(prompt) {
  if (typeof prompt !== 'string' || prompt.length === 0) return false;
  const lower = prompt.toLowerCase();
  return TRIGGERS.some(trigger => lower.includes(trigger));
}
