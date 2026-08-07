import { SupabaseService } from './SupabaseService';

// ---------------------------------------------------------------------------
// ChatPersistenceService — persistencia real del historial de chat de Wyrd.
//
// El chatHistory de Wyrd vive en useState de StudioEngine: sobrevive a la
// navegación dentro de la SPA (StudioEngine no remonta) pero muere en
// refresh/cierre. Este servicio lo respalda en la tabla `forge_chat_messages`
// de Supabase.
//
// IMPORTANTE: `forge_chat_messages` es la tabla de Wyrd Forge. NO confundir con
// `ai_studio_messages`, que pertenece a Nebu Studio — este servicio jamás la
// toca.
//
// Filosofía: la escritura es fire-and-forget con catch silencioso a log. Un
// fallo de guardado JAMÁS bloquea el chat. La tabla guarda TODO; la memoria
// (slice -30) y el contexto al pipeline (slice -10) siguen acotados aparte.
// ---------------------------------------------------------------------------

// Fila mínima que devuelve la lectura, forma cruda {role, content}. Es un
// subconjunto asignable al Message de ChatInterface (que añade opcionales), así
// que StudioEngine puede setearla directamente en chatHistory.
export interface PersistedChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Cuántos mensajes rehidratamos al abrir el proyecto.
const LOAD_LIMIT = 50;

export class ChatPersistenceService {
  /**
   * Inserta un mensaje DEFINITIVO en forge_chat_messages.
   *
   * Fire-and-forget: nunca hagas `await` de esto en una ruta que bloquee la UI.
   * Resuelve siempre (nunca rechaza) — cualquier error se traga a console.warn.
   * Persistir un mensaje jamás debe interrumpir el chat.
   *
   * Sólo persiste mensajes definitivos: el prompt del usuario al enviarse, la
   * respuesta final del assistant al cerrar el intent y los mensajes de sistema
   * visibles (cancelación, error de runtime). Los estados de progreso
   * transitorios ("Generando step 2/6…") NO llegan aquí.
   */
  static async persistMessage(
    projectId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // sin sesión no hay a quién atribuir el mensaje.

      const { error } = await supabase.from('forge_chat_messages').insert({
        project_id: projectId,
        user_id: user.id,
        role,
        content,
      });
      if (error) {
        console.warn('[ChatPersistenceService] persist failed:', error.message);
      }
    } catch (err) {
      console.warn('[ChatPersistenceService] persist threw:', err);
    }
  }

  /**
   * Lee los últimos LOAD_LIMIT mensajes del proyecto, ordenados por created_at
   * ascendente (los más antiguos primero) para rehidratar el chat en orden
   * cronológico natural.
   *
   * Devuelve [] ante cualquier fallo — la ausencia de historial nunca debe
   * romper la carga del proyecto.
   */
  static async loadRecent(projectId: string): Promise<PersistedChatMessage[]> {
    try {
      const supabase = SupabaseService.getInstance().client;
      // Tomamos los LOAD_LIMIT más RECIENTES (created_at desc) para no traer el
      // proyecto entero, y luego los invertimos a orden cronológico ascendente
      // para pintarlos como una conversación.
      const { data, error } = await supabase
        .from('forge_chat_messages')
        .select('role, content, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(LOAD_LIMIT);

      if (error) {
        console.warn('[ChatPersistenceService] load failed:', error.message);
        return [];
      }
      if (!data) return [];

      return data
        .slice()
        .reverse()
        .map((row) => ({
          role: row.role as 'user' | 'assistant',
          content: row.content as string,
        }));
    } catch (err) {
      console.warn('[ChatPersistenceService] load threw:', err);
      return [];
    }
  }
}
