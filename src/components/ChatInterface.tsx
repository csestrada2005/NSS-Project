import { useEffect, useMemo, useRef, useState } from 'react';
import {
  findExecutableProposal,
  stripDdlMarks,
  ddlProposedMark,
} from '@/utils/ddlProposalState.js';
import { appendModeMark, type ChatSendMode } from '@/utils/chatModeMark.js';
import type { ProgressLine } from './chat/progressSummary';
import { Typebar } from './chat/Typebar';
import { ProcessCard } from './chat/ProcessCard';
import { HistoryOverlay } from './chat/HistoryOverlay';
import { CreditsBadge } from './chat/CreditsBadge';
import {
  ResumenCard,
  DDLCard,
  SeguridadCard,
  PlanCard,
  CanceladoCard,
  ErrorCard,
} from './chat/ResultCards';
import type { ChatPlanStep, Message } from './chat/types';
import './chat/forgeChat.css';

// Re-exportados desde ./chat/types — ver ese archivo para el porqué (evita un
// ciclo de módulos con las tarjetas, que también necesitan estos tipos). El
// import externo de StudioEngine.tsx no cambia:
// `import { ChatInterface, type ChatPlanStep, type Message } from '../components/ChatInterface'`.
export type { ChatPlanStep, Message };

// El verbo de la línea de progreso sale de `step.action`, que el plan ya trae y
// hasta ahora nadie leía: cada línea rezaba "Creating", también las de un
// borrado. Anunciar un delete como "Creating" ataca justo el mecanismo que el
// gate de aprobación sostiene — el usuario aprueba un plan y ve ejecutarse otro.
const actionVerb = (action: ChatPlanStep['action']): string =>
  action === 'delete' ? 'Deleting' : action === 'modify' ? 'Updating' : 'Creating';

// Label de una línea de progreso: la description real del step truncada a 60
// chars y, si no hay description (callers viejos), el nombre de archivo.
const progressLabel = (description: string | undefined, file: string): string =>
  description && description.trim()
    ? (description.length > 60 ? `${description.slice(0, 60)}…` : description)
    : file;

// Saludo inicial. Se usa sólo cuando no hay historial rehidratado; extraído a
// constante para poder detectar (y no duplicar) el estado "sólo saludo". El
// rediseño no lo pinta en ningún lado (no hay feed de mensajes) — sigue
// existiendo únicamente para que la lógica de rehidratación/adopción de abajo
// distinga "chat intacto" de "chat con historial real", igual que antes.
const INITIAL_GREETING = 'Hello! How can I help you today?';

interface ChatInterfaceProps {
  isLoading: boolean;
  onSendMessage: (
    message: string,
    onProgress?: (step: number, total: number, file: string, description?: string) => void,
    onRetry?: (attempt: number, error: string) => void,
    onPlanReady?: (steps: ChatPlanStep[]) => void
  ) => Promise<{
    success: boolean;
    modifiedFiles: string[];
    error?: string;
    errorReason?: string;
    warning?: string;
    chatResponse?: string;
    suggestedAction?: string;
    planSteps?: ChatPlanStep[];
    /** Este turno terminó porque se canceló a mitad de camino (CANCELADO, 3.5). */
    cancelled?: boolean;
  }>;
  selectedElement: { tagName: string; className?: string } | null;
  chatHistory?: Message[];
  onHistoryUpdate?: (history: Message[]) => void;
  onPersistMessage?: (role: 'user' | 'assistant', content: string) => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  injectedMessage?: string | null;
  onInjectedConsumed?: () => void;
  projectId?: string | null;
  isReadOnly?: boolean;
  pendingPlanSteps?: ChatPlanStep[] | null;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  planModeEnabled?: boolean;
  onPlanModeChange?: (enabled: boolean) => void;
  /** Sólo para el subtítulo del historial ("N turnos · <nombre>"). */
  projectName?: string | null;
  /**
   * "Peek" (Ctrl+Espacio): esconde la typebar/tarjetas para revelar el
   * preview completo, sin cerrar el chat. Controlado desde StudioEngine
   * (QUEUE.md ítem 5.3 Bloque 6) — antes era estado local de este
   * componente, pero CommandModal también necesita saber este valor para
   * dejar de bloquear el scroll del preview mientras está escondido.
   */
  typebarHidden?: boolean;
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
  pendingPlanSteps = null,
  onApprovePlan,
  onRejectPlan,
  planModeEnabled = false,
  onPlanModeChange,
  projectName,
  typebarHidden = false,
}: ChatInterfaceProps) {
  // --- Estado heredado (sin cambios de lógica, sólo de qué lo consume) ------

  const [messages, setMessages] = useState<Message[]>(() =>
    chatHistory.length > 0 ? chatHistory : [{ role: 'assistant', content: INITIAL_GREETING }]
  );
  const messagesRef = useRef<Message[]>(messages);
  const [input, setInput] = useState(() => {
    try { return sessionStorage.getItem('forge_chat_input') ?? ''; } catch { return ''; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const refocusAfterRejectRef = useRef(false);

  const hasPendingPlan = !!pendingPlanSteps && pendingPlanSteps.length > 0;

  const [progressLines, setProgressLines] = useState<ProgressLine[]>([]);
  // Espejo síncrono de `progressLines`, leído al cerrar un turno para congelar
  // el snapshot de pasos de la tarjeta de resultado (Bloque 3) — el closure de
  // `sendMessage` sólo ve el valor de cuando arrancó el turno, no el último.
  const progressLinesSnapshotRef = useRef<ProgressLine[]>([]);
  useEffect(() => { progressLinesSnapshotRef.current = progressLines; }, [progressLines]);
  const planLineIndexRef = useRef<Map<string, { index: number; action: ChatPlanStep['action'] }>>(new Map());
  const isRetryingRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  // Último prompt enviado — el "eco" de la tarjeta de proceso (fc-prompt-eco).
  const [lastSentText, setLastSentText] = useState('');

  // Rediseño (2026-09-20), consolidado (2026-09-21): `mode` NO es estado
  // propio — es `planModeEnabled` derivado. El dato real que le importa al
  // pipeline (shouldGatePlan, la marca [MODE:...]) vive en StudioEngine; un
  // useState local aquí era una segunda copia que podía desalinearse del
  // prop. Mismo motivo por el que pendingPlanSteps tampoco es estado local.
  const mode: ChatSendMode = planModeEnabled ? 'plan' : 'auto';
  const [historyOpen, setHistoryOpen] = useState(false);

  const onHistoryUpdateRef = useRef(onHistoryUpdate);
  useEffect(() => { onHistoryUpdateRef.current = onHistoryUpdate; }, [onHistoryUpdate]);
  const onPersistMessageRef = useRef(onPersistMessage);
  useEffect(() => { onPersistMessageRef.current = onPersistMessage; }, [onPersistMessage]);

  useEffect(() => {
    messagesRef.current = messages;
    const isBareGreeting =
      messages.length === 1 &&
      messages[0].role === 'assistant' &&
      messages[0].content === INITIAL_GREETING;
    if (isBareGreeting) return;
    onHistoryUpdateRef.current?.(messages);
  }, [messages]);

  // Reconciliación con el prop — sin cambios de esta cirugía, ver comentario
  // original en el historial de git si hace falta el porqué línea a línea.
  useEffect(() => {
    if (!chatHistory || chatHistory.length === 0) return;
    const local = messagesRef.current;
    const localIsBareGreeting =
      local.length === 1 &&
      local[0].role === 'assistant' &&
      local[0].content === INITIAL_GREETING;
    const realLocal = localIsBareGreeting ? [] : local;
    const firstDiffers =
      realLocal.length > 0 &&
      (realLocal[0].role !== chatHistory[0].role ||
        realLocal[0].content !== chatHistory[0].content);
    const shouldAdopt =
      realLocal.length === 0 ||
      chatHistory.length > realLocal.length ||
      (firstDiffers && chatHistory.length >= realLocal.length);
    if (shouldAdopt) {
      messagesRef.current = chatHistory;
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  const appendMessage = (message: Message) => {
    const next = [...messagesRef.current, message];
    messagesRef.current = next;
    setMessages(next);
    onHistoryUpdateRef.current?.(next);
    if (message.role !== 'user') {
      onPersistMessageRef.current?.(message.role, message.content);
    }
  };

  const buildAssistantMessage = (result: {
    success: boolean;
    modifiedFiles: string[];
    error?: string;
    errorReason?: string;
    warning?: string;
    chatResponse?: string;
    suggestedAction?: string;
    planSteps?: ChatPlanStep[];
  }): { content: string; warning?: string; errorType?: 'insufficient_credits' | 'compile_error' | 'generic'; errorDetail?: string; suggestedAction?: string; planSteps?: ChatPlanStep[] } => {
    if (!result.success) {
      if (result.error === 'INSUFFICIENT_CREDITS') {
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
    if (result.chatResponse) {
      return { content: result.chatResponse, warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps };
    }
    if (result.modifiedFiles.length > 0) {
      return { content: `Done. Modified: ${result.modifiedFiles.join(', ')}`, warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps };
    }
    return { content: 'Done — no files needed changing.', warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || hasPendingPlan) return;

    const userMessage = text.trim();
    // La marca de modo va en el ECO local (y por eso también en lo persistido
    // vía StudioEngine, que la añade independientemente con el mismo valor de
    // modo — ver handleSendMessage) pero NUNCA en lo que recibe el pipeline:
    // `onSendMessage` de abajo sigue mandando `userMessage` pelado.
    appendMessage({ role: 'user', content: appendModeMark(userMessage, mode) });
    setLastSentText(userMessage);

    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
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
          const label = progressLabel(description, file);
          setProgressLines(prev => {
            const planEntry = planLineIndexRef.current.get(file);
            if (planEntry !== undefined) {
              return prev.map((line, i) =>
                i < planEntry.index && line.status === 'pending'
                  ? { ...line, status: 'done' as const }
                  : line
              );
            }
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Creating ${label}`, status: 'pending' });
            return next;
          });
        },
        (attempt, _errorMsg) => {
          isRetryingRef.current = true;
          setProgressLines(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Fixing compile error (attempt ${attempt}/3)...`, status: 'pending' });
            return next;
          });
        },
        steps => {
          const ordered = [...steps].sort((a, b) => a.order - b.order);
          const index = new Map<string, { index: number; action: ChatPlanStep['action'] }>();
          ordered.forEach((step, i) => {
            if (!index.has(step.file_path)) index.set(step.file_path, { index: i, action: step.action });
          });
          planLineIndexRef.current = index;
          setProgressLines(ordered.map(step => ({
            text: `${actionVerb(step.action)} ${progressLabel(step.description, step.file_path)}`,
            status: 'pending' as const,
          })));
        }
      );

      clearInterval(intervalId);
      planLineIndexRef.current = new Map();
      isRetryingRef.current = false;

      // Instantánea de los pasos de ESTE turno para el colapsable de la
      // tarjeta de resultado (Bloque 3) — mismas líneas que se vieron en vivo
      // en la tarjeta de proceso (Bloque 2), no un modelo nuevo.
      const finalLines = progressLinesSnapshotRef.current;
      const stepsSnapshot = finalLines.map(l => l.text);
      const stepsCompletedSnapshot = result.success
        ? finalLines.length
        : finalLines.filter(l => l.status === 'done').length;

      window.dispatchEvent(new CustomEvent('forge:credits-updated'));

      if (result.cancelled) {
        appendMessage({
          role: 'assistant',
          content: 'Cancelaste esta corrida. Lo que ya se había escrito se conservó; nada a medias se guardó.',
          cancelled: true,
          stepsSnapshot,
          stepsCompletedSnapshot,
        });
        return;
      }

      const { content, warning, errorType, errorDetail, suggestedAction, planSteps } = buildAssistantMessage(result);
      const proposedMark = result.success ? ddlProposedMark(result.modifiedFiles ?? []) : '';
      appendMessage({
        role: 'assistant',
        content: `${content}${proposedMark}`,
        warning,
        errorType,
        errorDetail,
        suggestedAction,
        planSteps,
        filesModifiedCount: result.success ? result.modifiedFiles.length : undefined,
        durationSeconds: result.success ? elapsedSeconds : undefined,
        stepsSnapshot,
        stepsCompletedSnapshot,
      });
    } catch (error) {
      clearInterval(intervalId);
      planLineIndexRef.current = new Map();
      isRetryingRef.current = false;
      console.error('Error in chat:', error);
      appendMessage({ role: 'assistant', content: 'Sorry, an unexpected error occurred.' });
    }
  };

  const handleSend = () => {
    if (isLoading) {
      onCancel?.();
      return;
    }
    if (!input.trim() || hasPendingPlan) return;
    const text = input;
    setInput('');
    try { sessionStorage.removeItem('forge_chat_input'); } catch { /* ignore */ }
    sendMessage(text);
  };

  const handleInputChange = (v: string) => {
    setInput(v);
    try { sessionStorage.setItem('forge_chat_input', v); } catch { /* ignore */ }
  };

  const handleModeChange = (next: ChatSendMode) => {
    onPlanModeChange?.(next === 'plan');
  };

  const handleRejectPlanClick = () => {
    refocusAfterRejectRef.current = true;
    onRejectPlan?.();
  };

  useEffect(() => {
    if (!refocusAfterRejectRef.current) return;
    if (hasPendingPlan || isLoading) return;
    refocusAfterRejectRef.current = false;
    inputRef.current?.focus();
  }, [hasPendingPlan, isLoading]);

  // CAMBIO 4 — auto-envío del mensaje inyectado desde el overlay ("Completar
  // proyecto"). Sin cambios de lógica respecto al chat viejo.
  const injectedSentRef = useRef<string | null>(null);
  useEffect(() => {
    const msg = injectedMessage?.trim();
    if (!msg || isLoading) return;
    if (injectedSentRef.current === msg) return;
    injectedSentRef.current = msg;
    sendMessage(msg);
    onInjectedConsumed?.();
  }, [injectedMessage, isLoading]);

  // El historial VIVO para la re-verificación de DDLApprovalButton al click.
  const getMessages = () => messagesRef.current;

  // --- Derivación de qué tarjeta (si alguna) mostrar en 'listo' -------------
  //
  // La propuesta de DDL ejecutable es ÚNICA en todo el historial (garantía de
  // ddlProposalState) y sigue viva hasta que se resuelve, aunque hayan pasado
  // más turnos — por eso se busca en TODO `messages`, no sólo en el último
  // turno: una migración pendiente no debe "perderse de vista" sólo porque el
  // usuario pidió otra cosa mientras tanto.
  const executableProposal = useMemo(() => findExecutableProposal(messages), [messages]);
  const proposalMessage = executableProposal ? messages[executableProposal.messageIndex] : undefined;

  const lastAssistantIndex = messages.reduce(
    (acc, msg, idx) => (msg.role === 'assistant' ? idx : acc),
    -1
  );
  const lastAssistant = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;

  // Campos "ricos" (filesModifiedCount, warning, cancelled, errorType) son
  // sólo de esta sesión — appendMessage persiste únicamente `content` (ver
  // comentario en ChatPersistenceService). Tras un refresh, el último mensaje
  // rehidratado no los trae, y por diseño eso cae a 'reposo': no se inventa
  // una tarjeta con datos que no están.
  const hasResult =
    !!executableProposal ||
    !!lastAssistant?.cancelled ||
    !!lastAssistant?.errorType ||
    !!lastAssistant?.warning ||
    lastAssistant?.filesModifiedCount !== undefined;

  const estado: 'reposo' | 'pensando' | 'listo' =
    hasPendingPlan || isLoading ? 'pensando' : hasResult ? 'listo' : 'reposo';

  const isBusy = isLoading;
  const processTitle = mode === 'plan' ? 'Armando el plan' : 'Trabajando';

  // Esc — prioridad: historial abierto > cancelar un run en curso. El menú de
  // modo se cierra solo (ModeSelector detiene la propagación de su propio Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (historyOpen) { setHistoryOpen(false); return; }
      if (isLoading) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyOpen, isLoading, onCancel]);

  return (
    <div className="forge-chat" data-estado={estado}>
      <div className={`fc-modal-layer ${typebarHidden ? 'fc-hidden' : ''}`}>
        <div className="fc-stack">
          <CreditsBadge />
          {selectedElement && (
            <div className="fc-pieza" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--fc-texto-2)' }}>
                Elemento seleccionado: <span style={{ fontFamily: 'var(--fc-mono)', color: 'var(--crema)' }}>
                  &lt;{selectedElement.tagName.toLowerCase()}{selectedElement.className ? `.${selectedElement.className.split(' ')[0]}` : ''}&gt;
                </span>
              </span>
            </div>
          )}

          {hasPendingPlan ? (
            <PlanCard
              steps={pendingPlanSteps!}
              onApprove={onApprovePlan}
              onReject={handleRejectPlanClick}
              onOpenHistory={() => setHistoryOpen(true)}
            />
          ) : estado === 'pensando' ? (
            <ProcessCard title={processTitle} promptEcho={lastSentText} lines={progressLines} />
          ) : estado === 'listo' ? (
            executableProposal ? (
              <DDLCard
                bodyText={proposalMessage ? stripDdlMarks(proposalMessage.content) : ''}
                proposal={executableProposal}
                projectId={projectId}
                isReadOnly={isReadOnly}
                isLoading={isLoading}
                getMessages={getMessages}
                onOutcome={content => appendMessage({ role: 'assistant', content })}
                filesCount={proposalMessage?.filesModifiedCount ?? 0}
                durationSeconds={proposalMessage?.durationSeconds ?? 0}
                steps={proposalMessage?.stepsSnapshot ?? []}
                completedCount={proposalMessage?.stepsSnapshot?.length ?? 0}
                onOpenHistory={() => setHistoryOpen(true)}
              />
            ) : lastAssistant?.cancelled ? (
              <CanceladoCard
                steps={lastAssistant.stepsSnapshot ?? []}
                completedCount={lastAssistant.stepsCompletedSnapshot ?? 0}
                onResume={() => inputRef.current?.focus()}
              />
            ) : lastAssistant?.errorType ? (
              <ErrorCard
                text={lastAssistant.content}
                errorDetail={lastAssistant.errorDetail}
                suggestedAction={lastAssistant.suggestedAction}
                actionLabel={lastAssistant.actionLabel}
                isLoading={isLoading}
                onSuggestedAction={action => sendMessage(action)}
              />
            ) : lastAssistant?.warning ? (
              <SeguridadCard
                warningText={lastAssistant.warning}
                filesCount={lastAssistant.filesModifiedCount ?? 0}
                durationSeconds={lastAssistant.durationSeconds ?? 0}
                steps={lastAssistant.stepsSnapshot ?? []}
                completedCount={lastAssistant.stepsSnapshot?.length ?? 0}
                onOpenHistory={() => setHistoryOpen(true)}
              />
            ) : lastAssistant ? (
              <ResumenCard
                filesCount={lastAssistant.filesModifiedCount ?? 0}
                durationSeconds={lastAssistant.durationSeconds ?? 0}
                steps={lastAssistant.stepsSnapshot ?? []}
                completedCount={lastAssistant.stepsSnapshot?.length ?? 0}
                onOpenHistory={() => setHistoryOpen(true)}
              />
            ) : null
          ) : null}
        </div>

        <Typebar
          value={input}
          onChange={handleInputChange}
          onSend={handleSend}
          isBusy={isBusy}
          isCancelling={isCancelling}
          mode={mode}
          onModeChange={handleModeChange}
          inputRef={inputRef}
        />
      </div>

      <HistoryOverlay
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        messages={messages.filter(m => !(m.role === 'assistant' && m.content === INITIAL_GREETING))}
        projectName={projectName}
        returnFocusRef={inputRef}
      />
    </div>
  );
}
