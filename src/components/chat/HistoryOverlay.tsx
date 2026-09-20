import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { stripDdlMarks } from '@/utils/ddlProposalState.js';
import { parseModeMark } from '@/utils/chatModeMark.js';
import type { Message } from './types';

/**
 * HistoryOverlay — Bloque 4 del rediseño: overlay a pantalla completa sobre
 * el preview, estilo menú de pausa. NO lee forge_chat_messages de nuevo — usa
 * el mismo `messages` que ChatInterface ya tiene en memoria (rehidratado al
 * abrir el proyecto y mantenido al día en cada turno), así que abrir el
 * historial no dispara ninguna consulta nueva y el turno que se acaba de
 * cerrar aparece de inmediato, sin esperar un round-trip.
 *
 * El chip de modo sólo aparece en turnos de USUARIO posteriores a este
 * cambio (los que llevan la marca `[MODE:...]`) — el historial de antes de
 * hoy no la tiene y se pinta sin chip, no con uno inventado.
 */
export function HistoryOverlay({
  isOpen,
  onClose,
  messages,
  projectName,
  returnFocusRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  projectName?: string | null;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      closeBtnRef.current?.focus();
    }
    if (!isOpen && wasOpenRef.current) {
      returnFocusRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, returnFocusRef]);

  return (
    <div
      className={`fc-historial ${isOpen ? 'fc-abierto' : ''}`}
      aria-hidden={!isOpen}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button ref={closeBtnRef} type="button" className="fc-icon-btn fc-cerrar" aria-label="Cerrar historial" onClick={onClose}>
        <X size={16} />
      </button>
      <div className="fc-historial-panel">
        <div className="fc-historial-head">
          <h2>Historial de la conversación</h2>
          <span>{messages.length} turno{messages.length === 1 ? '' : 's'}{projectName ? ` · ${projectName}` : ''}</span>
        </div>
        <div className="fc-historial-scroll">
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const { text, mode } = isUser ? parseModeMark(msg.content) : { text: msg.content, mode: null };
            const shown = isUser ? text : stripDdlMarks(text);
            return (
              <div key={i} className={`fc-turno ${isUser ? 'fc-usuario' : ''}`}>
                <div className="fc-turno-quien">
                  {isUser ? 'Tú' : 'Wyrd'}
                  {mode && <span className="fc-turno-modo">{mode === 'plan' ? 'plan' : 'automático'}</span>}
                </div>
                <p>{shown}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
