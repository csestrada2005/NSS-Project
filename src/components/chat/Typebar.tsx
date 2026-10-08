import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Paperclip, Mic, ArrowUp, Square, X, FileText, Image as ImageIcon, Upload, FolderOpen } from 'lucide-react';
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
  onPickExisting,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isBusy: boolean;
  /** El cierre de una cancelación ya en curso — el botón se deshabilita para no mandar un segundo abort. */
  isCancelling?: boolean;
  mode: ChatSendMode;
  onModeChange: (mode: ChatSendMode) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  attachments?: AttachmentChip[];
  /** Sin él (sin proyecto o sólo lectura) el clip queda inerte. */
  onAttach?: (files: FileList | null) => void;
  onRemoveAttachment?: (key: string) => void;
  /** Abre "Elegir de Archivos" (reusar lo ya subido). */
  onPickExisting?: () => void;
}) {
  const { t } = useForgeLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const [clipOpen, setClipOpen] = useState(false);

  // Alto según el texto: se mide en cada cambio; el tope lo pone el CSS
  // (max-height) y pasado el tope la caja se desplaza por dentro.
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [value, inputRef]);

  useEffect(() => {
    if (!clipOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!clipRef.current?.contains(e.target as Node)) setClipOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [clipOpen]);

  const chipNote = (a: AttachmentChip) => {
    if (a.status === 'uploading') return t('chat.attach.uploading');
    if (a.status === 'error') return t('chat.attach.failed', { message: a.error ?? '' });
    // Elegido de Archivos y ya leído antes: no se vuelve a pagar la lectura.
    if (a.asset?.has_reading) return t('chat.attach.reused');
    if (a.kind === 'document') return t('chat.attach.willRead');
    return a.mime === 'image/svg+xml' ? t('chat.attach.urlOnly') : t('chat.attach.willSee');
  };
  return (
    <div className="fc-stack fc-stack-barra">
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
        {/* Crece con el texto hasta ~8 líneas (2026-10-08, Samuel): un pedido
            largo se puede revisar antes de enviarlo. Enter envía; Shift+Enter
            es salto de línea. */}
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          disabled={isBusy}
          placeholder={t('chat.input.placeholder')}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
        {/* Clip (2026-10-08): subir nuevo o elegir de Archivos. Sin
            onPickExisting abre directo el selector de archivos. */}
        <div className="fc-clip" ref={clipRef}>
          <button
            type="button"
            className="fc-icon-btn"
            aria-label={t('chat.input.attach')}
            aria-haspopup={onPickExisting ? 'true' : undefined}
            aria-expanded={onPickExisting ? clipOpen : undefined}
            title={onAttach ? t('chat.input.attach') : t('common.comingSoon')}
            disabled={!onAttach || isBusy}
            onClick={(e) => {
              if (!onPickExisting) { fileRef.current?.click(); return; }
              e.stopPropagation();
              setClipOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && clipOpen) { e.stopPropagation(); setClipOpen(false); }
            }}
          >
            <Paperclip size={14} />
          </button>
          {onPickExisting && (
            <div className={`fc-modo-menu ${clipOpen ? 'fc-abierto' : ''}`} role="menu">
              <button
                type="button"
                role="menuitem"
                className="fc-modo-opt"
                onClick={() => { setClipOpen(false); fileRef.current?.click(); }}
              >
                <Upload size={13} />
                <span><strong>{t('chat.attach.menuUpload')}</strong></span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="fc-modo-opt"
                onClick={() => { setClipOpen(false); onPickExisting(); }}
              >
                <FolderOpen size={13} />
                <span><strong>{t('chat.attach.menuPick')}</strong></span>
              </button>
            </div>
          )}
        </div>
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
