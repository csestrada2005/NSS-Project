import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, Loader2, CheckCircle, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  warning?: string;
  errorType?: 'insufficient_credits' | 'compile_error' | 'generic';
  errorDetail?: string;
  suggestedAction?: string;
}

// Saludo inicial. Se usa sólo cuando no hay historial rehidratado; extraído a
// constante para poder detectar (y no duplicar) el estado "sólo saludo".
const INITIAL_GREETING = 'Hello! How can I help you today?';

interface ChatInterfaceProps {
  isLoading: boolean;
  onSendMessage: (
    message: string,
    onProgress?: (step: number, total: number, file: string) => void,
    onRetry?: (attempt: number, error: string) => void
  ) => Promise<{ success: boolean; modifiedFiles: string[]; error?: string; warning?: string; chatResponse?: string; suggestedAction?: string }>;
  selectedElement: { tagName: string; className?: string } | null;
  chatHistory?: Message[];
  onHistoryUpdate?: (history: Message[]) => void;
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
  };

  const buildAssistantMessage = (result: { success: boolean; modifiedFiles: string[]; error?: string; warning?: string; chatResponse?: string; suggestedAction?: string }): { content: string; warning?: string; errorType?: 'insufficient_credits' | 'compile_error' | 'generic'; errorDetail?: string; suggestedAction?: string } => {
    if (!result.success) {
      if (result.error === 'INSUFFICIENT_CREDITS') {
        return {
          content: "You've used your free build. Top up credits to continue building.",
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
      return { content: result.chatResponse, warning: result.warning, suggestedAction: result.suggestedAction };
    }
    if (result.modifiedFiles.length > 0) {
      return { content: `Done. Modified: ${result.modifiedFiles.join(', ')}`, warning: result.warning };
    }
    return { content: 'Done — no files needed changing.', warning: result.warning };
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
        (_step, _total, file) => {
          setProgressLines(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Creating ${file}`, status: 'pending' });
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

      const { content, warning, errorType, errorDetail, suggestedAction } = buildAssistantMessage(result);
      // Reportamos al padre directamente: si el modal se cerró durante el await,
      // la instancia está desmontada y setMessages sería un no-op, pero el padre
      // (montado) recibe la respuesta enriquecida completa igualmente.
      appendMessage({ role: 'assistant', content, warning, errorType, errorDetail, suggestedAction });
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
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
              {msg.warning && (
                <p className="text-yellow-400 text-xs mt-2">⚠️ {msg.warning}</p>
              )}
              {msg.errorType === 'compile_error' && msg.errorDetail && (
                <CompileErrorDetail errorDetail={msg.errorDetail} />
              )}
              {msg.role === 'assistant' && msg.suggestedAction && !isLoading && index === lastAssistantIndex && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <button
                    onClick={() => sendMessage(msg.suggestedAction!)}
                    disabled={isLoading}
                    className="w-full text-left flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-4 h-4 shrink-0" />
                    <span className="line-clamp-2">{msg.suggestedAction}</span>
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
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-primary text-white p-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
