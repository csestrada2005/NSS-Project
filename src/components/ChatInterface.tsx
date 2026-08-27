import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, Loader2, CheckCircle, ChevronDown, ChevronUp, Wand2, Square } from 'lucide-react';
import {
  ddlProposedMark,
  resolveDdlProposals,
  stripDdlMarks,
  type DdlProposal,
} from '@/utils/ddlProposalState.js';
import { DDLApprovalButton } from './forge/DDLApprovalButton';

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
}

// Saludo inicial. Se usa sólo cuando no hay historial rehidratado; extraído a
// constante para poder detectar (y no duplicar) el estado "sólo saludo".
const INITIAL_GREETING = 'Hello! How can I help you today?';

interface ChatInterfaceProps {
  isLoading: boolean;
  onSendMessage: (
    message: string,
    onProgress?: (step: number, total: number, file: string, description?: string) => void,
    onRetry?: (attempt: number, error: string) => void
  ) => Promise<{ success: boolean; modifiedFiles: string[]; error?: string; errorReason?: string; warning?: string; chatResponse?: string; suggestedAction?: string; planSteps?: ChatPlanStep[] }>;
  selectedElement: { tagName: string; className?: string } | null;
  chatHistory?: Message[];
  onHistoryUpdate?: (history: Message[]) => void;
  // Persistencia real: se invoca por cada mensaje DEFINITIVO que entra al chat
  // (prompt del usuario al enviarse, respuesta final del assistant al cerrar el
  // intent, mensajes de sistema visibles). Fire-and-forget en el padre — nunca
  // bloquea el chat. Los estados de progreso transitorios NO pasan por aquí.
  onPersistMessage?: (role: 'user' | 'assistant', content: string) => void;
  // CAMBIO 2 — cancelación. `onCancel` aborta la generación en curso; sólo se
  // muestra mientras `isLoading`. `isCancelling` deshabilita el botón durante el
  // cierre para evitar dobles cancelaciones.
  onCancel?: () => void;
  isCancelling?: boolean;
  // CAMBIO 4 — mensaje inyectado desde fuera del chat (botón "Completar proyecto"
  // del overlay post-cancelación). Cuando cambia a un string no vacío, se envía
  // por el flujo normal del chat y se notifica al padre para que lo limpie.
  injectedMessage?: string | null;
  onInjectedConsumed?: () => void;
  // CIRUGÍA 2 — aprobación de DDL inline. El botón que aplica una migración vive
  // dentro del mensaje que la propuso, así que necesita saber contra qué
  // proyecto aplicaría y si esta sesión puede escribir en él. Sin projectId el
  // botón se pinta deshabilitado: el estado de la propuesta sigue siendo
  // legible, pero no hay dónde ejecutarla.
  projectId?: string | null;
  isReadOnly?: boolean;
}

function BuildProgress({
  lines,
  elapsedSeconds,
  isExpanded,
  onToggleExpand,
  lastError,
}: {
  lines: { text: string; status: 'pending' | 'done' | 'error' }[];
  elapsedSeconds: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  lastError: string | null;
}) {
  const isLastDone = lines.length > 0 && lines[lines.length - 1].status !== 'pending';

  const getPlainEnglish = () => {
    const pending = lines.find(l => l.status === 'pending');
    const lastLine = pending || lines[lines.length - 1];
    if (!lastLine) return 'Working on it...';
    const text = lastLine.text;
    if (text === 'Planning...') return 'Figuring out what to build...';
    if (text.includes('Creating')) return 'Writing new components...';
    if (text.includes('Fixing')) return 'Fixing a small issue...';
    if (text.includes('Modified')) return 'All done ✓';
    return 'Working on it...';
  };

  return (
    <div className="flex justify-start w-full">
      <div className="bg-background border border-border rounded-lg p-3 w-[85%]">
        <div className="flex items-center gap-2 text-sm text-foreground">
          {isLastDone
            ? <CheckCircle size={14} className="text-green-400 shrink-0" />
            : <Loader2 size={14} className="animate-spin shrink-0" />}
          <span>{getPlainEnglish()}</span>
          {!isLastDone && (
            <span className="text-gray-500 text-xs">{elapsedSeconds}s</span>
          )}
        </div>
        <button
          onClick={onToggleExpand}
          className="text-xs text-gray-500 mt-1 hover:text-gray-400 transition-colors"
        >
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
        {isExpanded && (
          <div className="mt-2 font-mono text-xs space-y-1">
            {lines.map((line, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <div className={`flex items-center gap-2 ${
                  line.status === 'done' ? 'text-gray-500' :
                  line.status === 'error' ? 'text-red-400' : 'text-green-400'
                }`}>
                  {line.status === 'done' && <span>✓</span>}
                  {line.status === 'error' && <span>✗</span>}
                  {line.status === 'pending' && <span className="animate-spin inline-block">⟳</span>}
                  <span>{line.text}</span>
                </div>
                {line.status === 'pending' && (
                  <span className="text-gray-500">{elapsedSeconds}s</span>
                )}
              </div>
            ))}
            {lastError && (
              <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-400">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold">Error Details</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(lastError)}
                    className="text-gray-400 hover:text-white underline text-[10px]"
                  >
                    Copy error
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre-wrap text-[10px]">
                  {lastError}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CompileErrorDetail({ errorDetail }: { errorDetail: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        What went wrong?
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-background border border-border rounded text-[10px] text-primary overflow-x-auto whitespace-pre-wrap">
          {errorDetail}
        </pre>
      )}
    </div>
  );
}

export function ChatInterface({
  isLoading,
  onSendMessage,
  selectedElement,
  chatHistory = [],
  onHistoryUpdate,
  onPersistMessage,
  onCancel,
  isCancelling = false,
  injectedMessage,
  onInjectedConsumed,
  projectId,
  isReadOnly = false,
}: ChatInterfaceProps) {
  // Rehidratación: si el padre trae historial (sobreviviente de un cierre del
  // modal), arrancamos con él. Sólo si está vacío usamos el saludo inicial, de
  // modo que el saludo no se duplique en remontajes sucesivos.
  const [messages, setMessages] = useState<Message[]>(() =>
    chatHistory.length > 0 ? chatHistory : [{ role: 'assistant', content: INITIAL_GREETING }]
  );
  // Espejo síncrono de `messages`. La continuación del await en sendMessage
  // sigue viva en el closure aunque la instancia se desmonte (cierre del
  // modal): entonces `setMessages` es un no-op y el estado no es fiable. El ref
  // conserva la última lista conocida para poder reportarla al padre
  // directamente. Se mantiene actualizado por `appendMessage` (síncrono) y por
  // el efecto sobre `messages` (rehidratación / cualquier otra vía).
  const messagesRef = useRef<Message[]>(messages);
  const [input, setInput] = useState(() => {
    try { return sessionStorage.getItem('forge_chat_input') ?? ''; } catch { return ''; }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [progressLines, setProgressLines] = useState<{
    text: string;
    status: 'pending' | 'done' | 'error';
  }[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [buildLogExpanded, setBuildLogExpanded] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Persistencia continua: cada cambio en messages (mensaje del usuario,
  // respuesta del asistente, avisos del Verifier y errores) se sube al estado
  // del padre con la lista COMPLETA de Message enriquecidos, de modo que cerrar
  // el modal en cualquier momento no pierda nada.
  //
  // onHistoryUpdate se pasa como arrow inline desde StudioEngine (identidad
  // nueva en cada render), por eso lo leemos vía ref: incluirlo en las deps
  // provocaría un bucle infinito de re-render/persistencia.
  const onHistoryUpdateRef = useRef(onHistoryUpdate);
  useEffect(() => {
    onHistoryUpdateRef.current = onHistoryUpdate;
  }, [onHistoryUpdate]);

  // Mismo patrón vía ref que onHistoryUpdate: la continuación del await en
  // sendMessage puede resolver tras el desmontaje de esta instancia (cierre del
  // modal). El ref garantiza que appendMessage llame siempre a la última versión
  // del callback y que la persistencia dispare aunque el componente ya no exista.
  const onPersistMessageRef = useRef(onPersistMessage);
  useEffect(() => {
    onPersistMessageRef.current = onPersistMessage;
  }, [onPersistMessage]);

  useEffect(() => {
    // El ref debe seguir a `messages` siempre, incluso en el estado "sólo
    // saludo", para que `appendMessage` parta de la lista real en el primer
    // envío.
    messagesRef.current = messages;
    // No persistimos el estado "sólo saludo": un chat intacto no debe crear
    // historial (ni reintroducir el saludo en el contexto del modelo).
    const isBareGreeting =
      messages.length === 1 &&
      messages[0].role === 'assistant' &&
      messages[0].content === INITIAL_GREETING;
    if (isBareGreeting) return;
    onHistoryUpdateRef.current?.(messages);
  }, [messages]);

  // Reconciliación con el prop: una instancia montada DURANTE un pipeline en
  // vuelo (p. ej. remontada tras cerrar/abrir el modal mientras corre otra
  // instancia) sólo leyó `chatHistory` en el initializer de useState. Cuando el
  // padre recibe la respuesta de la continuación en vuelo y hace
  // `setChatHistory` con un array nuevo (las continuaciones ya entregan
  // referencias nuevas), este efecto adopta ese historial más completo.
  //
  // Regla estricta: adoptamos SÓLO cuando el prop es estrictamente más largo
  // que el estado local (el padre sabe más). Nunca reemplazamos con un prop de
  // igual o menor longitud, para no pisar mensajes locales aún no propagados.
  useEffect(() => {
    if (!chatHistory || chatHistory.length === 0) return;
    const local = messagesRef.current;

    // El saludo inicial pelado NO es historial real: es el placeholder de un chat
    // intacto. Comparar longitudes contra él es la raíz de la regresión — un
    // historial rehidratado de UN solo mensaje (p.ej. el prompt inicial del
    // proyecto) daba `1 > 1 = false` y NO se adoptaba, dejando el modal mostrando
    // sólo el saludo. Por eso medimos contra los mensajes REALES (excluido el
    // saludo), no contra la lista cruda.
    const localIsBareGreeting =
      local.length === 1 &&
      local[0].role === 'assistant' &&
      local[0].content === INITIAL_GREETING;
    const realLocal = localIsBareGreeting ? [] : local;

    // Identidad del primer mensaje real: si difiere del primero del prop, el
    // padre trae un historial DISTINTO (más autoritativo: rehidratado de
    // forge_chat_messages o sembrado del prompt inicial). Adoptamos por identidad
    // aunque las longitudes empaten — cubre el caso "1 vs 1 con contenido
    // distinto" que la comparación por sólo-longitud dejaba pasar.
    const firstDiffers =
      realLocal.length > 0 &&
      (realLocal[0].role !== chatHistory[0].role ||
        realLocal[0].content !== chatHistory[0].content);

    // Regla de adopción, ordenada para no PISAR jamás mensajes locales:
    //  - local es sólo el saludo (no hay nada real que perder) → adoptar;
    //  - el prop es estrictamente más largo (el padre sabe más) → adoptar;
    //  - misma-o-mayor longitud pero el primer mensaje difiere → adoptar por
    //    identidad. Nunca adoptamos un prop MÁS CORTO con primer msg distinto,
    //    porque eso descartaría mensajes locales aún no propagados.
    const shouldAdopt =
      realLocal.length === 0 ||
      chatHistory.length > realLocal.length ||
      (firstDiffers && chatHistory.length >= realLocal.length);

    if (shouldAdopt) {
      messagesRef.current = chatHistory;
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  // Añade un mensaje reportando SIEMPRE al padre, sin depender del estado
  // propio. Actualiza el ref de forma síncrona (para que envíos encadenados
  // partan de la lista correcta), intenta el setMessages local (no-op inocuo si
  // la instancia está desmontada) y llama a onHistoryUpdate directamente para
  // que el padre —que sigue montado— reciba el historial completo aunque el
  // componente ya no exista. El doble disparo con el efecto sobre `messages`
  // (cuando la instancia sigue viva) es idempotente: setChatHistory reemplaza.
  const appendMessage = (message: Message) => {
    const next = [...messagesRef.current, message];
    messagesRef.current = next;
    setMessages(next);
    onHistoryUpdateRef.current?.(next);
    // Persistencia real: cada mensaje DEFINITIVO del assistant (respuesta final,
    // error inesperado visible) que pasa por appendMessage se persiste aquí. Los
    // estados de progreso transitorios ("Creating…") viven en progressLines, no en
    // messages, así que nunca llegan aquí. Fire-and-forget.
    //
    // El mensaje del USUARIO NO se persiste en este camino: se escribe al inicio
    // de handleSendMessage (embudo común de todos los envíos, incluido el
    // initialPrompt que no pasa por aquí). Persistirlo también aquí lo duplicaría.
    if (message.role !== 'user') {
      onPersistMessageRef.current?.(message.role, message.content);
    }
  };

  const buildAssistantMessage = (result: { success: boolean; modifiedFiles: string[]; error?: string; errorReason?: string; warning?: string; chatResponse?: string; suggestedAction?: string; planSteps?: ChatPlanStep[] }): { content: string; warning?: string; errorType?: 'insufficient_credits' | 'compile_error' | 'generic'; errorDetail?: string; suggestedAction?: string; planSteps?: ChatPlanStep[] } => {
    if (!result.success) {
      if (result.error === 'INSUFFICIENT_CREDITS') {
        // CAMBIO 2c — the "free build used" copy is only honest when the user
        // actually spent their free prompt without ever purchasing. Any other
        // depletion (bought credits, now below the floor) gets the neutral copy.
        const freePromptSpent = result.errorReason === 'FREE_PROMPT_SPENT';
        return {
          content: freePromptSpent
            ? "You've used your free build. Top up credits to continue building."
            : 'Saldo insuficiente — recarga créditos para continuar.',
          errorType: 'insufficient_credits',
        };
      }
      if (result.error && result.error.length > 0) {
        return {
          content: "The AI couldn't fix the compile error after 3 attempts. Your last working version is preserved.",
          errorType: 'compile_error',
          errorDetail: result.error.slice(-200),
        };
      }
      return { content: 'Sorry, something went wrong processing your request.', errorType: 'generic' };
    }
    // CIRUGÍA B1 — planSteps viaja en las TRES ramas de éxito y en ninguna de
    // fallo: en el camino de fallo el verify no persistió nada, así que pintar
    // "Plan ejecutado" sería falso.
    if (result.chatResponse) {
      return { content: result.chatResponse, warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps };
    }
    if (result.modifiedFiles.length > 0) {
      // Propagate suggestedAction here too — on partial success the plan lane
      // reports 'Done. Modified: ...' with a follow-up action, and the action
      // button must render alongside the success message, not only chatResponse.
      return { content: `Done. Modified: ${result.modifiedFiles.join(', ')}`, warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps };
    }
    return { content: 'Done — no files needed changing.', warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage = text.trim();
    appendMessage({ role: 'user', content: userMessage });

    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setLastError(null);
    setProgressLines([{ text: 'Planning...', status: 'pending' }]);

    const intervalId = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    try {
      const result = await onSendMessage(
        userMessage,
        (_step, _total, file, description) => {
          // CAMBIO 4 (progreso honesto): la línea muestra la description real del
          // step del plan (qué se está construyendo), truncada a 60 chars, en vez
          // del "Creating <archivo>" genérico. Si no hay description (callers
          // viejos), cae al nombre de archivo.
          const label = description && description.trim()
            ? (description.length > 60 ? `${description.slice(0, 60)}…` : description)
            : file;
          setProgressLines(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Creating ${label}`, status: 'pending' });
            return next;
          });
        },
        (attempt, _errorMsg) => {
          setProgressLines(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Fixing compile error (attempt ${attempt}/3)...`, status: 'pending' });
            return next;
          });
        }
      );

      clearInterval(intervalId);

      if (result.success) {
        setProgressLines([{ text: `Modified ${result.modifiedFiles.length} files in ${elapsedSeconds}s`, status: 'done' }]);
        setTimeout(() => setProgressLines([]), 4000);
        window.dispatchEvent(new CustomEvent('forge:credits-updated'));
      } else {
        setProgressLines(prev => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1].status = 'error';
          }
          if (result.error !== 'INSUFFICIENT_CREDITS') {
            next.push({ text: 'Failed after 3 retries', status: 'error' });
          }
          return next;
        });
        if (result.error && result.error !== 'INSUFFICIENT_CREDITS') {
          setLastError(result.error);
        }
      }

      const { content, warning, errorType, errorDetail, suggestedAction, planSteps } = buildAssistantMessage(result);
      // CIRUGÍA 2 — la marca de propuesta viaja EN EL CONTENIDO del mensaje.
      //
      // No es telemetría duplicada: es el único sitio donde el estado del botón
      // sobrevive a lo que le pasa a este componente. El chat se remonta al
      // cerrar el modal, se rehidrata desde el padre y se recarga desde
      // forge_chat_messages tras un refresh; un `useState` con "hay una
      // migración pendiente" muere en cualquiera de los tres. El contenido del
      // mensaje sobrevive a los tres, porque es lo que se persiste.
      //
      // El formato es literalmente el mismo del sufijo de forge_intent_log
      // (ddlProposedMark delega en migrationPath.js), y la marca se OCULTA al
      // renderizar: lo que el usuario ve es el botón, no el corchete.
      const proposedMark = result.success ? ddlProposedMark(result.modifiedFiles ?? []) : '';
      // Reportamos al padre directamente: si el modal se cerró durante el await,
      // la instancia está desmontada y setMessages sería un no-op, pero el padre
      // (montado) recibe la respuesta enriquecida completa igualmente.
      appendMessage({
        role: 'assistant',
        content: `${content}${proposedMark}`,
        warning,
        errorType,
        errorDetail,
        suggestedAction,
        // CIRUGÍA B1 — sólo estado de sesión: appendMessage persiste `content` y
        // nada más, así que el plan no se guarda ni se rehidrata (igual que
        // suggestedAction). No se toca la persistencia por esto.
        planSteps,
      });
    } catch (error) {
      clearInterval(intervalId);
      console.error('Error in chat:', error);
      setProgressLines(prev => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1].status = 'error';
        }
        return next;
      });
      appendMessage({ role: 'assistant', content: 'Sorry, an unexpected error occurred.' });
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    try { sessionStorage.removeItem('forge_chat_input'); } catch { /* ignore */ }
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // CAMBIO 4 — auto-envío del mensaje inyectado desde el overlay ("Completar
  // proyecto"). Se dispara por el flujo normal del chat (sendMessage), una sola
  // vez por valor. El ref evita doble envío bajo StrictMode / re-render antes de
  // que el padre limpie el prop.
  const injectedSentRef = useRef<string | null>(null);
  useEffect(() => {
    const msg = injectedMessage?.trim();
    if (!msg || isLoading) return;
    if (injectedSentRef.current === msg) return;
    injectedSentRef.current = msg;
    sendMessage(msg);
    onInjectedConsumed?.();
  }, [injectedMessage, isLoading]);

  // CIRUGÍA 2 — el estado de cada propuesta de DDL, DERIVADO del historial.
  //
  // No hay estado propio que mantener sincronizado: se recalcula con `messages`,
  // que es la misma lista que se rehidrata y se persiste. Por eso una propuesta
  // ya aplicada sigue viéndose aplicada tras un refresh, y por eso llegar una
  // propuesta nueva deja la anterior en `superseded` sin que nadie la avise.
  //
  // El resolutor garantiza el invariante del que depende que esto sea seguro:
  // como mucho UNA propuesta ejecutable en todo el historial.
  const proposalsByMessage = useMemo(() => {
    const byMessage = new Map<number, DdlProposal[]>();
    for (const proposal of resolveDdlProposals(messages)) {
      const list = byMessage.get(proposal.messageIndex);
      if (list) list.push(proposal);
      else byMessage.set(proposal.messageIndex, [proposal]);
    }
    return byMessage;
  }, [messages]);

  // El historial VIVO para la re-verificación al click. Va por ref, no por
  // valor: el botón tiene que preguntar por el estado del INSTANTE del click,
  // no por el que se capturó al pintarlo.
  const getMessages = () => messagesRef.current;

  // Índice del mensaje del asistente más reciente: sólo ese muestra su botón
  // de acción sugerida, para no disparar acciones sobre estado viejo.
  const lastAssistantIndex = messages.reduce(
    (acc, msg, idx) => (msg.role === 'assistant' ? idx : acc),
    -1
  );

  return (
    <div className="flex flex-col h-full w-full bg-card">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <Bot className="w-6 h-6 text-primary shrink-0" />
        <h2 className="text-xl font-bold text-foreground">Wyrd Forge</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-white'
                  : msg.errorType === 'insufficient_credits'
                  ? 'bg-amber-900/40 border border-amber-600/50 text-amber-200'
                  : msg.errorType === 'compile_error'
                  ? 'bg-muted text-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="text-sm leading-relaxed space-y-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1 [&_a]:underline [&_a]:text-primary [&_strong]:font-semibold [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0">
                  {/* Las marcas [DDL_…] son maquinaria del botón de abajo, no
                      texto: viven en el contenido (que se persiste) y se
                      recortan al pintar. */}
                  <ReactMarkdown>{stripDdlMarks(msg.content)}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
              {/* CIRUGÍA B1 — el plan que se ejecutó, en solo lectura. Se ordena
                  aquí por `order` porque es el campo con el que el Implementer
                  decide la ejecución; el array puede llegar en el orden de
                  emisión del Architect (planTrim conserva el orden original). */}
              {msg.planSteps && msg.planSteps.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Plan ejecutado
                  </p>
                  <ul className="space-y-1">
                    {[...msg.planSteps]
                      .sort((a, b) => a.order - b.order)
                      .map((step, idx) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span
                            className={
                              step.action === 'create'
                                ? 'text-green-500 text-sm leading-5'
                                : step.action === 'delete'
                                ? 'text-red-400 text-sm leading-5'
                                : 'text-blue-400 text-sm leading-5'
                            }
                          >
                            {step.action === 'create' ? '+' : step.action === 'delete' ? '✕' : '✎'}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm">{step.description}</span>
                            <span className="block text-xs font-mono text-muted-foreground truncate">
                              {step.file_path}
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {msg.warning && (
                <p className="text-yellow-400 text-xs mt-2">⚠️ {msg.warning}</p>
              )}
              {msg.errorType === 'compile_error' && msg.errorDetail && (
                <CompileErrorDetail errorDetail={msg.errorDetail} />
              )}
              {msg.role === 'assistant' && proposalsByMessage.get(index)?.map((proposal, nth) => (
                <DDLApprovalButton
                  key={`${proposal.key}#${nth}`}
                  proposal={proposal}
                  projectId={projectId}
                  getMessages={getMessages}
                  onOutcome={content => appendMessage({ role: 'assistant', content })}
                  // Modo lectura: el endpoint ya rechaza a quien no es dueño del
                  // proyecto, pero ofrecer el botón a quien no puede pulsarlo es
                  // prometer algo que no va a pasar. Durante una generación
                  // tampoco: el archivo que se aplicaría puede estar
                  // reescribiéndose ahora mismo.
                  disabled={isReadOnly || isLoading}
                />
              ))}
              {msg.role === 'assistant' && msg.suggestedAction && !isLoading && index === lastAssistantIndex && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <button
                    onClick={() => sendMessage(msg.suggestedAction!)}
                    disabled={isLoading}
                    className="w-full text-left flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-4 h-4 shrink-0" />
                    <span className="line-clamp-2">{msg.actionLabel ?? msg.suggestedAction}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {progressLines.length > 0 && (
          <BuildProgress
            lines={progressLines}
            elapsedSeconds={elapsedSeconds}
            isExpanded={buildLogExpanded}
            onToggleExpand={() => setBuildLogExpanded(v => !v)}
            lastError={lastError}
          />
        )}
        {isLoading && progressLines.length === 0 && (
          <div className="flex justify-start w-full">
             <div className="bg-muted text-foreground rounded-lg p-3 text-sm flex items-center gap-1">
               <Loader2 className="w-4 h-4 animate-spin" />
               <span className="text-xs text-muted-foreground">Thinking...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border bg-card">
        {selectedElement && (
          <div className="mb-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded text-xs text-primary flex items-center justify-between">
            <span>
              Selected: <span className="font-mono text-red-100">&lt;{selectedElement.tagName.toLowerCase()}{selectedElement.className ? `.${selectedElement.className.split(' ')[0]}` : ''}&gt;</span>
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              try { sessionStorage.setItem('forge_chat_input', e.target.value); } catch { /* ignore */ }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-accent text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          />
          {isLoading && onCancel ? (
            // CAMBIO 2 — botón Cancelar: visible sólo durante la generación. Un
            // click (sin modal). Deshabilitado mientras se cierra la cancelación.
            <button
              onClick={onCancel}
              disabled={isCancelling}
              title="Cancelar generación"
              className="flex items-center gap-1.5 bg-destructive/90 text-white px-3 py-2 rounded-md hover:bg-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              <span>{isCancelling ? 'Cancelando…' : 'Cancelar'}</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-primary text-white p-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
