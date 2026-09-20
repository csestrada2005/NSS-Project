import { Paperclip, Mic, ArrowUp, Square } from 'lucide-react';
import { LiveNode } from './LiveNode';
import { ModeSelector } from './ModeSelector';
import { CreditsHint } from './CreditsHint';
import type { ChatSendMode } from '@/utils/chatModeMark.js';

/**
 * Typebar — Bloque 1 del rediseño: nodo vivo | selector de modo | input |
 * adjuntar | dictar | enviar↔cancelar, más la pista debajo.
 *
 * Adjuntar/dictar no tienen ninguna capacidad real detrás hoy (no hay adjuntos
 * ni dictado en el pipeline) — se pintan inertes con tooltip "Próximamente",
 * mismo trato que "Editar el plan": el layout del mockup se respeta sin
 * fingir una función que no existe.
 */
export function Typebar({
  value,
  onChange,
  onSend,
  isBusy,
  isCancelling,
  mode,
  onModeChange,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isBusy: boolean;
  /** El cierre de una cancelación ya en curso — el botón se deshabilita para no mandar un segundo abort. */
  isCancelling?: boolean;
  mode: ChatSendMode;
  onModeChange: (mode: ChatSendMode) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="fc-stack">
      <div className="typebar">
        <LiveNode />
        <ModeSelector mode={mode} onChange={onModeChange} disabled={isBusy} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={isBusy}
          placeholder="Dile a Wyrd qué construir…"
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button type="button" className="fc-icon-btn" aria-label="Adjuntar" disabled title="Próximamente">
          <Paperclip size={14} />
        </button>
        <button type="button" className="fc-icon-btn" aria-label="Dictar" disabled title="Próximamente">
          <Mic size={14} />
        </button>
        <button
          type="button"
          className={`fc-icon-btn fc-enviar ${isBusy ? 'fc-cancelar' : ''}`}
          aria-label={isBusy ? 'Cancelar' : 'Enviar'}
          disabled={isBusy && isCancelling}
          onClick={onSend}
        >
          {isBusy ? <Square size={13} /> : <ArrowUp size={16} />}
        </button>
      </div>
      <div className="fc-pista">
        <span className="fc-izq">
          {mode === 'plan'
            ? <span><b>Modo plan</b> · Wyrd pide tu visto bueno antes de tocar archivos</span>
            : <span>Modo automático</span>}
        </span>
        <CreditsHint />
      </div>
    </div>
  );
}
