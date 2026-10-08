import { useEffect, useMemo, useRef, useState } from 'react';
import {
  findExecutableProposal,
  stripDdlMarks,
  ddlProposedMark,
  buildOutcomeMessage,
  migrationFilesToRemove,
  nextProposalPaths,
  ddlOutcomeMark,
  OUTCOME_DISMISSED,
} from '@/utils/ddlProposalState.js';
import { AIOrchestrator } from '../services/AIOrchestrator';
import { getForgeLang } from '@/i18n/forge/lang';
import { appendModeMark, type ChatSendMode } from '@/utils/chatModeMark.js';
import type { ProgressLine } from './chat/progressSummary';
import { Typebar } from './chat/Typebar';
import { ProcessCard } from './chat/ProcessCard';
import { HistoryOverlay } from './chat/HistoryOverlay';
import { CreditsBadge } from './chat/CreditsBadge';
import {
  ResumenCard,
  UltimoMensajeCard,
  PendingDdlNotice,
  PendingDdlActions,
  DDLCard,
  SeguridadCard,
  PlanCard,
  CanceladoCard,
  ErrorCard,
  TypeErrorsCard,
  RespuestaCard,
} from './chat/ResultCards';
import type { ChatPlanStep, Message } from './chat/types';
import './chat/forgeChat.css';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { t as tNow, tn as tnNow } from '@/i18n/forge/lang';
import { platformService, type TypeIssue, type ProjectAsset } from '../services/PlatformService';
import { readAsBase64 } from './studio/AssetsPanel';
import type { AttachmentChip } from './chat/Typebar';
import { MissingSecretsCard } from './chat/MissingSecretsCard';
import { changedNames } from '../utils/changedNames';
import { progressHeadline } from '../utils/progressHeadline.js';

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
  tNow(action === 'delete' ? 'chat.verb.delete' : action === 'modify' ? 'chat.verb.modify' : 'chat.verb.create');

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
    onPlanReady?: (steps: ChatPlanStep[]) => void,
    /** Bloque 3: fotos/PDFs adjuntos a este mensaje (ya subidos al almacén). */
    attachments?: ProjectAsset[]
  ) => Promise<{
    success: boolean;
    modifiedFiles: string[];
    /** Archivos que el turno borró (para no seguir ofreciendo una migración borrada). */
    removedFiles?: string[];
    error?: string;
    errorReason?: string;
    warning?: string;
    chatResponse?: string;
    suggestedAction?: string;
    planSteps?: ChatPlanStep[];
    /** Este turno terminó porque se canceló a mitad de camino (CANCELADO, 3.5). */
    cancelled?: boolean;
    /** Bucket 6 — errores de tipos que quedaron (funciona, pero aún no publicable). */
    typeErrors?: TypeIssue[];
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
   * componente. (Desde 2026-09-30 CommandModal ya no lo necesita: deja pasar
   * el scroll al preview siempre.)
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
  // Adjuntos del mensaje en curso (bloque 3): se suben al elegirlos (gratis);
  // la lectura con IA ocurre al enviar.
  const [attachments, setAttachments] = useState<AttachmentChip[]>([]);
  // Llaves (2026-10-08): sube tras cada pedido para que la tarjeta vuelva a revisar.
  const [secretsCheck, setSecretsCheck] = useState(0);
  // Espejo síncrono de `progressLines`, leído al cerrar un turno para congelar
  // el snapshot de pasos de la tarjeta de resultado (Bloque 3) — el closure de
  // `sendMessage` sólo ve el valor de cuando arrancó el turno, no el último.
  const progressLinesSnapshotRef = useRef<ProgressLine[]>([]);
  useEffect(() => { progressLinesSnapshotRef.current = progressLines; }, [progressLines]);
  const planLineIndexRef = useRef<Map<string, { index: number; action: ChatPlanStep['action'] }>>(new Map());
  const isRetryingRef = useRef(false);
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
  // "Revisar" de una migración pendiente de un turno anterior (PendingDdlNotice).
  const [ddlReviewOpen, setDdlReviewOpen] = useState(false);
  useEffect(() => {
    if (typebarHidden) setHistoryOpen(false);
  }, [typebarHidden]);

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
    typeErrors?: TypeIssue[];
  }): { content: string; warning?: string; errorType?: 'insufficient_credits' | 'compile_error' | 'generic'; errorDetail?: string; suggestedAction?: string; planSteps?: ChatPlanStep[]; typeErrors?: TypeIssue[] } => {
    if (!result.success) {
      if (result.error === 'ATTACHMENT_READ_FAILED') {
        return { content: tNow('chat.error.attachmentRead', { name: result.errorReason ?? '' }), errorType: 'generic' };
      }
      if (result.error === 'INSUFFICIENT_CREDITS') {
        const freePromptSpent = result.errorReason === 'FREE_PROMPT_SPENT';
        return {
          content: freePromptSpent ? tNow('chat.error.freeSpent') : tNow('chat.error.noCredits'),
          errorType: 'insufficient_credits',
        };
      }
      if (result.error && result.error.length > 0) {
        return {
          content: tNow('chat.error.compile'),
          errorType: 'compile_error',
          errorDetail: result.error.slice(-200),
        };
      }
      return { content: tNow('chat.error.generic'), errorType: 'generic' };
    }
    if (result.chatResponse) {
      return { content: result.chatResponse, warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps, typeErrors: result.typeErrors };
    }
    if (result.modifiedFiles.length > 0) {
      return { content: tnNow('chat.done.changed', result.modifiedFiles.length, { names: changedNames(result.modifiedFiles) }), warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps, typeErrors: result.typeErrors };
    }
    return { content: tNow('chat.done.none'), warning: result.warning, suggestedAction: result.suggestedAction, planSteps: result.planSteps, typeErrors: result.typeErrors };
  };

  const sendMessage = async (text: string, sentChips: AttachmentChip[] = []) => {
    if (!text.trim() || isLoading || hasPendingPlan) return;
    const sentAssets = sentChips.flatMap((c) => (c.asset ? [c.asset] : []));

    const userMessage = text.trim();
    // La marca de modo va en el ECO local (y por eso también en lo persistido
    // vía StudioEngine, que la añade independientemente con el mismo valor de
    // modo — ver handleSendMessage) pero NUNCA en lo que recibe el pipeline:
    // `onSendMessage` de abajo sigue mandando `userMessage` pelado.
    appendMessage({ role: 'user', content: appendModeMark(userMessage, mode) });
    setLastSentText(userMessage);

    startTimeRef.current = Date.now();
    // "Planeando…" sólo en modo Plan; en Automático no se planea nada visible.
    setProgressLines([{
      // Automático: la línea dice QUÉ está haciendo ("Cambiando el título…"),
      // no "Trabajando en tu pedido" (2026-10-01, Samuel).
      text: mode === 'plan'
        ? tNow('chat.progress.planning')
        : progressHeadline(userMessage, getForgeLang()) ?? tNow('chat.progress.working'),
      status: 'pending',
      kind: 'planning',
    }]);

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
            next.push({ text: `${actionVerb('create')} ${label}`, status: 'pending' });
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
            next.push({ text: tNow('chat.progress.fixing', { attempt, max: 3 }), status: 'pending' });
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
            // El resumen del Architect ya es una acción ("Crea la sección…"):
            // anteponerle "Creando" la duplicaba; se pasa a gerundio ("Creando
            // la sección…", Samuel 2026-10-01). Sin resumen, verbo + descripción.
            text: step.summary
              ? (() => {
                  const label = progressLabel(step.summary, step.file_path);
                  return progressHeadline(label, getForgeLang()) ?? label;
                })()
              : `${actionVerb(step.action)} ${progressLabel(step.description, step.file_path)}`,
            status: 'pending' as const,
          })));
        },
        sentAssets
      );

      // 3A: no se pudo leer un adjunto — vuelven los adjuntos y el texto para reintentar.
      if (result.error === 'ATTACHMENT_READ_FAILED') {
        setAttachments((prev) => [...sentChips, ...prev]);
        setInput((prev) => (prev.trim() ? prev : userMessage));
      }

      planLineIndexRef.current = new Map();
      isRetryingRef.current = false;
      setSecretsCheck((n) => n + 1);

      // Instantánea de los pasos de ESTE turno para el colapsable de la
      // tarjeta de resultado (Bloque 3) — mismas líneas que se vieron en vivo
      // en la tarjeta de proceso (Bloque 2), no un modelo nuevo.
      // La línea inicial "Planeando..." sólo existe mientras se decide qué
      // hacer; no es un paso del turno (en un cambio chico era la única línea
      // y la tarjeta final la listaba como "1 paso completado").
      const finalLines = progressLinesSnapshotRef.current.filter(l => l.kind !== 'planning');
      const stepsSnapshot = finalLines.map(l => l.text);
      const stepsCompletedSnapshot = result.success
        ? finalLines.length
        : finalLines.filter(l => l.status === 'done').length;

      window.dispatchEvent(new CustomEvent('forge:credits-updated'));

      if (result.cancelled) {
        appendMessage({
          role: 'assistant',
          content: tNow('chat.cancelled'),
          cancelled: true,
          stepsSnapshot,
          stepsCompletedSnapshot,
        });
        return;
      }

      const { content, warning, errorType, errorDetail, suggestedAction, planSteps, typeErrors } = buildAssistantMessage(result);
      // La propuesta del turno INCLUYE la pendiente (se aplican juntas) y no
      // ofrece lo que el turno borró. Si el turno borró la pendiente, queda
      // registrada como descartada (2026-10-01).
      const previousProposal = findExecutableProposal(messagesRef.current);
      const removed = result.removedFiles ?? [];
      const proposalPaths = result.success
        ? nextProposalPaths(previousProposal, result.modifiedFiles ?? [], removed)
        : [];
      const pendingRemoved = !!previousProposal && previousProposal.paths.some((p) => removed.includes(p));
      const proposedMark =
        (pendingRemoved ? ddlOutcomeMark(OUTCOME_DISMISSED, previousProposal!.paths) : '') +
        ddlProposedMark(proposalPaths);
      appendMessage({
        role: 'assistant',
        content: `${content}${proposedMark}`,
        warning,
        errorType,
        errorDetail,
        suggestedAction,
        planSteps,
        typeErrors,
        filesModifiedCount: result.success ? result.modifiedFiles.length : undefined,
        // Del reloj al terminar: antes se leía un contador en estado desde el
        // closure de sendMessage, que veía el valor de cuando arrancó (0).
        durationSeconds: result.success && startTimeRef.current
          ? Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000))
          : undefined,
        reply: result.success && !!result.chatResponse,
        stepsSnapshot,
        stepsCompletedSnapshot,
      });
    } catch (error) {
      planLineIndexRef.current = new Map();
      isRetryingRef.current = false;
      console.error('Error in chat:', error);
      appendMessage({ role: 'assistant', content: tNow('chat.error.unexpected') });
    }
  };

  const handleSend = () => {
    if (isLoading) {
      onCancel?.();
      return;
    }
    if (!input.trim() || hasPendingPlan) return;
    // Bloque 3: no se envía con un adjunto a medio subir.
    if (attachments.some((a) => a.status === 'uploading')) return;
    const text = input;
    const chips = attachments.filter((a) => a.status === 'ready');
    setInput('');
    setAttachments([]);
    try { sessionStorage.removeItem('forge_chat_input'); } catch { /* ignore */ }
    sendMessage(text, chips);
  };

  const handleAttach = async (files: FileList | null) => {
    if (!projectId || !files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const kind: AttachmentChip['kind'] = file.type === 'application/pdf' ? 'document' : 'image';
      setAttachments((prev) => [...prev, { key, name: file.name, kind, mime: file.type, status: 'uploading' }]);
      try {
        const asset = await platformService.uploadAsset(projectId, { name: file.name, type: file.type, data: await readAsBase64(file) });
        setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, status: 'ready', asset, mime: asset.mime_type } : a)));
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, status: 'error', error } : a)));
      }
    }
  };

  const handleRemoveAttachment = (key: string) => {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
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
  // La tarjeta DDL sólo manda si la propuesta es del ÚLTIMO turno. Si viene de
  // uno anterior, manda el resultado nuevo y la migración queda como aviso
  // (PendingDdlNotice) — 2026-09-30, Samuel: "cuando hay que aplicar SQL no
  // cambia el modal".
  const proposalIsLatest = !!executableProposal && executableProposal.messageIndex === lastAssistantIndex;
  const olderPendingProposal = executableProposal && !proposalIsLatest ? executableProposal : null;

  // Campos "ricos" (filesModifiedCount, warning, cancelled, errorType) son
  // sólo de esta sesión — appendMessage persiste únicamente `content` (ver
  // comentario en ChatPersistenceService). Tras un refresh, el último mensaje
  // rehidratado no los trae, y por diseño eso cae a 'reposo': no se inventa
  // una tarjeta con datos que no están.
  // "Descartar" / "No aplicar": escribe el veredicto 'dismissed' en el chat y
  // quita los .sql del proyecto. No llama al runner ni a la base; sobrevive al
  // refresh (va en el contenido).
  const dismissProposal = (paths: string[]) => {
    setDdlReviewOpen(false);
    const content = buildOutcomeMessage({ outcome: OUTCOME_DISMISSED, paths }, getForgeLang());
    if (content) {
      appendMessage({ role: 'assistant', content });
      AIOrchestrator.removeProjectFiles(migrationFilesToRemove({ outcome: OUTCOME_DISMISSED, paths }));
    }
  };

  const hasResult =
    proposalIsLatest ||
    !!lastAssistant?.cancelled ||
    !!lastAssistant?.errorType ||
    !!lastAssistant?.warning ||
    lastAssistant?.filesModifiedCount !== undefined;

  const estado: 'reposo' | 'pensando' | 'listo' =
    hasPendingPlan || isLoading ? 'pensando' : hasResult ? 'listo' : 'reposo';

  const isBusy = isLoading;
  const { t } = useForgeLang();
  const processTitle = mode === 'plan' ? t('chat.process.plan') : t('chat.process.auto');

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
                {t('chat.selected')} <span style={{ fontFamily: 'var(--fc-mono)', color: 'var(--crema)' }}>
                  &lt;{selectedElement.tagName.toLowerCase()}{selectedElement.className ? `.${selectedElement.className.split(' ')[0]}` : ''}&gt;
                </span>
              </span>
            </div>
          )}

          {olderPendingProposal && !hasPendingPlan && estado !== 'pensando' && (() => {
            // Sólo escribe el veredicto 'dismissed' en el chat y quita el .sql del
            // proyecto: no llama al runner ni a la base. Sobrevive al refresh.
            const dismiss = () => dismissProposal(olderPendingProposal.paths);
            // Con "Revisar" abierto, la tarjeta DDL trae Ocultar / Descartar en su
            // propia fila (2026-10-01) y la línea chica se esconde.
            return ddlReviewOpen ? (
              <DDLCard
                bodyText={proposalMessage ? stripDdlMarks(proposalMessage.content) : ''}
                warning={proposalMessage?.warning}
                proposal={olderPendingProposal}
                projectId={projectId}
                isReadOnly={isReadOnly}
                isLoading={isLoading}
                getMessages={getMessages}
                onOutcome={content => { setDdlReviewOpen(false); appendMessage({ role: 'assistant', content }); }}
                filesCount={proposalMessage?.filesModifiedCount ?? 0}
                durationSeconds={proposalMessage?.durationSeconds ?? 0}
                steps={proposalMessage?.stepsSnapshot ?? []}
                completedCount={proposalMessage?.stepsSnapshot?.length ?? 0}
                onOpenHistory={() => setHistoryOpen(true)}
                hideHistory
                extraActions={
                  <PendingDdlActions
                    onHide={() => setDdlReviewOpen(false)}
                    onDismiss={dismiss}
                    disabled={isReadOnly || isLoading}
                  />
                }
              />
            ) : (
              <PendingDdlNotice
                paths={olderPendingProposal.paths}
                reviewOpen={false}
                onToggleReview={() => setDdlReviewOpen(true)}
                disabled={isReadOnly || isLoading}
                onDismiss={dismiss}
              />
            );
          })()}

          {projectId && !isReadOnly && !hasPendingPlan && estado !== 'pensando' && (
            <MissingSecretsCard projectId={projectId} checkKey={secretsCheck} disabled={isLoading} />
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
            <>
            {/* Bucket 6 — funciona en el editor, pero aún no se puede publicar. */}
            {!lastAssistant?.errorType && !lastAssistant?.cancelled && (lastAssistant?.typeErrors?.length ?? 0) > 0 && (
              <TypeErrorsCard
                errors={lastAssistant!.typeErrors!}
                isLoading={isLoading}
                onFix={(prompt: string) => sendMessage(prompt)}
              />
            )}
            {executableProposal && proposalIsLatest ? (
              <DDLCard
                bodyText={proposalMessage ? stripDdlMarks(proposalMessage.content) : ''}
                warning={proposalMessage?.warning}
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
                // "No aplicar" en la migración del último pedido (2026-10-01, Samuel).
                extraActions={
                  <PendingDdlActions
                    onDismiss={() => dismissProposal(executableProposal.paths)}
                    disabled={isReadOnly || isLoading}
                    dismissLabel={t('chat.ddl.reject')}
                  />
                }
              />
            ) : lastAssistant?.cancelled ? (
              <CanceladoCard
                steps={lastAssistant.stepsSnapshot ?? []}
                completedCount={lastAssistant.stepsCompletedSnapshot ?? 0}
                // "Retomar desde aquí" reenvía el pedido cancelado: lo ya escrito
                // se conservó, así que la IA sigue desde ahí. Sin pedido que
                // reenviar (p. ej. tras recargar), sólo enfoca la caja de texto.
                onResume={() => {
                  if (lastSentText && !isLoading) sendMessage(lastSentText);
                  else inputRef.current?.focus();
                }}
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
            ) : lastAssistant?.reply ? (
              <RespuestaCard
                text={lastAssistant.content}
                suggestedAction={lastAssistant.suggestedAction}
                isLoading={isLoading}
                onSuggestedAction={action => sendMessage(action)}
                onOpenHistory={() => setHistoryOpen(true)}
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
                text={stripDdlMarks(lastAssistant.content)}
                filesCount={lastAssistant.filesModifiedCount ?? 0}
                durationSeconds={lastAssistant.durationSeconds ?? 0}
                steps={lastAssistant.stepsSnapshot ?? []}
                completedCount={lastAssistant.stepsSnapshot?.length ?? 0}
                onOpenHistory={() => setHistoryOpen(true)}
              />
            ) : null}
            </>
          ) : lastAssistant && lastAssistant.content !== INITIAL_GREETING ? (
            // Reposo con historial (p. ej. recién abierto el proyecto): el
            // último mensaje de la IA + acceso al historial completo.
            <UltimoMensajeCard
              text={stripDdlMarks(lastAssistant.content)}
              onOpenHistory={() => setHistoryOpen(true)}
            />
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
          attachments={attachments}
          onAttach={projectId && !isReadOnly ? handleAttach : undefined}
          onRemoveAttachment={handleRemoveAttachment}
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
