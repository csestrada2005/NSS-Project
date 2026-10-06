import { useRef } from 'react';
import { Paperclip, Mic, ArrowUp, Square, X, FileText, Image as ImageIcon } from 'lucide-react';
import type { ProjectAsset } from '@/services/PlatformService';
import LoadingSquares from '../brand/LoadingSquares';
import { LiveNode } from './LiveNode';
import { ModeSelector } from './ModeSelector';
import type { ChatSendMode } from '@/utils/chatModeMark.js';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Typebar — Bloque 1 del rediseño: nodo vivo | selector de modo | input |
 * adjuntar | dictar | enviar↔cancelar.
 *
 * Sin la pista de debajo (texto "Modo automático"/"Modo plan · ...") — el
 * propio dropdown de modo ya dice en qué modo está y qué hace cada uno al
 * abrirse; repetirlo en una línea aparte era redundante (pedido explícito,
 * 2026-09-20). Los créditos se movieron arriba del todo, ver CreditsBadge en
 * ChatInterface.tsx — ya no viven en esta pista tampoco.
 *
 * Dictar no tiene capacidad real detrás hoy — se pinta inerte con tooltip
 * "Próximamente", mismo trato que "Editar el plan".
 *
 * Adjuntar (bloque 3, 2026-10-07): fotos y PDFs, en fichas encima de la barra.
 * Cada ficha dice si leerla gasta créditos (la IA mira las fotos y lee los
 * PDFs una vez al enviar; un SVG sólo aporta su dirección).
 */
const ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,application/pdf';

export interface AttachmentChip {
  key: string;
  name: string;
  kind: 'image' | 'document';
  mime: string;
  status: 'uploading' | 'ready' | 'error';
  asset?: ProjectAsset;
  error?: string;
}
export function Typebar({
  value,
  onChange,
  onSend,
  isBusy,
  isCancelling,
  mode,
  onModeChange,
  inputRef,
  attachments = [],
  onAttach,
  onRemoveAttachment,
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
  attachments?: AttachmentChip[];
  /** Sin él (sin proyecto o sólo lectura) el clip queda inerte. */
  onAttach?: (files: FileList | null) => void;
  onRemoveAttachment?: (key: string) => void;
}) {
  const { t } = useForgeLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const chipNote = (a: AttachmentChip) => {
    if (a.status === 'uploading') return t('chat.attach.uploading');
    if (a.status === 'error') return t('chat.attach.failed', { message: a.error ?? '' });
    if (a.kind === 'document') return t('chat.attach.willRead');
    return a.mime === 'image/svg+xml' ? t('chat.attach.urlOnly') : t('chat.attach.willSee');
  };
  return (
    <div className="fc-stack">
      {attachments.length > 0 && (
        <ul className="fc-adjuntos" aria-label={t('chat.input.attach')}>
          {attachments.map((a) => (
            <li key={a.key} className={`fc-adjunto ${a.status === 'error' ? 'fc-adjunto-error' : ''}`}>
              {a.status === 'uploading'
                ? <LoadingSquares size={12} />
                : a.kind === 'document' ? <FileText size={13} /> : <ImageIcon size={13} />}
              <span className="fc-adjunto-nombre" title={a.name}>{a.name}</span>
              <span className="fc-adjunto-nota">{chipNote(a)}</span>
              <button
                type="button"
                className="fc-adjunto-quitar"
                aria-label={t('chat.attach.remove', { name: a.name })}
                disabled={isBusy}
                onClick={() => onRemoveAttachment?.(a.key)}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="typebar">
        <LiveNode />
        <ModeSelector mode={mode} onChange={onModeChange} disabled={isBusy} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={isBusy}
          placeholder={t('chat.input.placeholder')}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept={ATTACH_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            onAttach?.(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="fc-icon-btn"
          aria-label={t('chat.input.attach')}
          title={onAttach ? t('chat.input.attach') : t('common.comingSoon')}
          disabled={!onAttach || isBusy}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={14} />
        </button>
        <button type="button" className="fc-icon-btn" aria-label={t('chat.input.dictate')} disabled title={t('common.comingSoon')}>
          <Mic size={14} />
        </button>
        <button
          type="button"
          className={`fc-icon-btn fc-enviar ${isBusy ? 'fc-cancelar' : ''}`}
          aria-label={isBusy ? t('common.cancel') : t('chat.input.send')}
          disabled={isBusy && isCancelling}
          onClick={onSend}
        >
          {isBusy ? <Square size={13} /> : <ArrowUp size={16} />}
        </button>
      </div>
    </div>
  );
}
