/**
 * Tipos compartidos entre ChatInterface.tsx y los subcomponentes de
 * src/components/chat/ — separados de ChatInterface.tsx para que las
 * tarjetas puedan importar estos tipos sin crear un ciclo de módulos con el
 * propio ChatInterface (que a su vez importa las tarjetas). ChatInterface.tsx
 * re-exporta ambos desde aquí, así que el import externo de StudioEngine.tsx
 * (`import { ChatInterface, type ChatPlanStep, type Message } from
 * '../components/ChatInterface'`) no cambia.
 */

/**
 * CIRUGÍA B1 — forma de un paso del plan tal como lo consume el chat.
 *
 * Declarado aquí, estructural, y NO importado de services/Architect: el chat
 * pinta lo que le llega y no debe acoplarse al módulo que genera el plan. Si el
 * BuildStep del Architect gana campos, este render sigue compilando.
 */
export interface ChatPlanStep {
  order: number;
  description: string;
  file_path: string;
  action: 'create' | 'modify' | 'delete';
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  /**
   * Plan ejecutado por el pipeline (plan lane). Efímero en sesión: appendMessage
   * persiste sólo `content`, así que tras un refresh el mensaje se rehidrata sin
   * plan — mismo trato que suggestedAction.
   */
  planSteps?: ChatPlanStep[];
  warning?: string;
  errorType?: 'insufficient_credits' | 'compile_error' | 'generic';
  errorDetail?: string;
  suggestedAction?: string;
  // Etiqueta corta opcional para el botón de acción. Cuando está presente, el
  // botón muestra este texto en vez del prompt completo de `suggestedAction`
  // (que puede ser largo, p.ej. un error de runtime + stack). El onClick sigue
  // enviando `suggestedAction` íntegro al pipeline.
  actionLabel?: string;

  // --- Rediseño del modal de chat (2026-09-20) ---------------------------
  /** Cuántos archivos modificó este turno. Sólo en mensajes de éxito. */
  filesModifiedCount?: number;
  /** Cuánto tardó el turno, en segundos. Sólo en mensajes de éxito. */
  durationSeconds?: number;
  /** Este turno terminó porque el usuario canceló a mitad de camino. */
  cancelled?: boolean;
  /**
   * Las líneas de progreso EN VIVO de este turno (mismo lenguaje llano que se
   * mostró en la tarjeta de proceso), congeladas al terminar — es la fuente
   * del bloque colapsable "N pasos completados" de la tarjeta de resultado.
   * Efímero en sesión, como planSteps/suggestedAction.
   */
  stepsSnapshot?: string[];
  /** Cuántas de `stepsSnapshot` llegaron a 'done'. */
  stepsCompletedSnapshot?: number;
}
