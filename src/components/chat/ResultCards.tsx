import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StepsCollapse } from './StepsCollapse';
import { useSqlPreview } from './useSqlPreview';
import { DDLApprovalButton } from '../forge/DDLApprovalButton';
import type { DdlProposal, ProposalSourceMessage } from '@/utils/ddlProposalState.js';
import type { ChatPlanStep } from './types';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { TypeIssue } from '../../services/PlatformService';
import { t as tNow } from '@/i18n/forge/lang';
import { MiniMarkdown } from './MiniMarkdown';

/**
 * ResultCards — las 5 variantes de tarjeta de resultado (Bloque 3 del
 * rediseño) + una sexta (ErrorCard) que el mockup no cubre pero que el chat
 * ya necesitaba: saldo insuficiente y "no pude arreglar el error de compilar
 * tras 3 intentos" son estados reales del pipeline, no cosméticos — quitarlos
 * habría sido una regresión, no una limpieza. Se pinta con el mismo look
 * neutro que CANCELADO (ninguno de los dos es "acción pendiente" en rojo).
 *
 * Regla dura del padre (ChatInterface): en 'listo' se monta EXACTAMENTE una
 * de estas por vez — la exclusión vive ahí, no aquí.
 */

function FilesLine({ count, seconds }: { count: number; seconds: number }) {
  const { t, tn } = useForgeLang();
  return (
    <div className="fc-resumen-texto" style={{ fontSize: 12, marginBottom: 11 }}>
      <b>{tn('chat.files.modified', count)}</b> · {t('chat.files.compiled')} · {seconds}s
    </div>
  );
}

interface StepsProps {
  steps: string[];
  completedCount: number;
}

// ---------------------------------------------------------------------------
// 3.1 — RESUMEN
// ---------------------------------------------------------------------------
export function ResumenCard({
  filesCount,
  durationSeconds,
  steps,
  completedCount,
  onOpenHistory,
}: StepsProps & { filesCount: number; durationSeconds: number; onOpenHistory: () => void }) {
  const { t, tn } = useForgeLang();
  return (
    <div className="fc-pieza">
      <div className="fc-resumen">
        <div className="fc-resumen-texto">
          <b>{tn('chat.files.modified', filesCount)}</b> · {t('chat.files.compiled')} · {durationSeconds}s
        </div>
        <button type="button" className="fc-pill" onClick={onOpenHistory}>{t('chat.card.fullHistory')}</button>
      </div>
      {steps.length > 0 && (
        <>
          <div className="fc-sep" />
          <StepsCollapse steps={steps} completedCount={completedCount} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3.2 — DDL (aprobación de migración)
// ---------------------------------------------------------------------------
export function DDLCard({
  bodyText,
  proposal,
  projectId,
  isReadOnly,
  isLoading,
  getMessages,
  onOutcome,
  filesCount,
  durationSeconds,
  steps,
  completedCount,
  onOpenHistory,
}: StepsProps & {
  bodyText: string;
  proposal: DdlProposal;
  projectId?: string | null;
  isReadOnly?: boolean;
  isLoading: boolean;
  getMessages: () => ProposalSourceMessage[];
  onOutcome: (content: string) => void;
  filesCount: number;
  durationSeconds: number;
  onOpenHistory: () => void;
}) {
  const sql = useSqlPreview(projectId, proposal.paths);
  const { t } = useForgeLang();

  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador">{t('chat.card.ddl.tag')}</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{t('chat.card.ddl.title')}</span>
      </div>
      <p className="fc-accion-cuerpo">{bodyText} {t('chat.card.ddl.body')}</p>
      <div className="fc-accion-fila">
        <DDLApprovalButton
          proposal={proposal}
          projectId={projectId}
          getMessages={getMessages}
          onOutcome={onOutcome}
          disabled={isReadOnly || isLoading}
        />
        <button type="button" className="fc-accion-btn fc-secundario" onClick={sql.toggle} disabled={sql.loading}>
          {sql.loading ? t('chat.card.ddl.reading') : sql.open ? t('chat.card.ddl.hideSql') : t('chat.card.ddl.showSql')}
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          {t('chat.card.fullHistory')}
        </button>
      </div>
      {sql.open && (
        <div style={{ marginTop: 10 }}>
          {sql.error && (
            <p className="fc-accion-cuerpo" style={{ color: 'rgba(214,40,40,.85)', margin: 0 }}>{sql.error}</p>
          )}
          {sql.sqlByPath?.map(([path, text]) => (
            <div key={path} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--fc-texto-3)', marginBottom: 4 }}>
                {sql.fileName(path)}
              </div>
              <pre className="fc-accion-cuerpo" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowX: 'auto', fontFamily: 'var(--fc-mono)', fontSize: 11 }}>
                {text}
              </pre>
            </div>
          ))}
        </div>
      )}
      <div className="fc-sep" />
      <FilesLine count={filesCount} seconds={durationSeconds} />
      <StepsCollapse steps={steps} completedCount={completedCount} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3.3 — SEGURIDAD (guard RLS/código de cliente actuó, sin nada que aprobar)
// ---------------------------------------------------------------------------
export function SeguridadCard({
  warningText,
  filesCount,
  durationSeconds,
  steps,
  completedCount,
  onOpenHistory,
}: StepsProps & { warningText: string; filesCount: number; durationSeconds: number; onOpenHistory: () => void }) {
  // "Ver qué cambió" no tiene un visor de diff dedicado — expande el mismo
  // colapsable de pasos, que es lo más cercano que existe a "qué se tocó" sin
  // inventar una vista nueva fuera de alcance de esta sesión (sólo-UI).
  const [detailOpen, setDetailOpen] = useState(false);
  const { t } = useForgeLang();
  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador">{t('chat.card.security.tag')}</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{t('chat.card.security.title')}</span>
      </div>
      <p className="fc-accion-cuerpo">{warningText}</p>
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn fc-secundario" onClick={() => setDetailOpen(v => !v)}>
          {detailOpen ? t('chat.card.security.hide') : t('chat.card.security.show')}
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          {t('chat.card.fullHistory')}
        </button>
      </div>
      <div className="fc-sep" />
      <FilesLine count={filesCount} seconds={durationSeconds} />
      <StepsCollapse steps={steps} completedCount={completedCount} open={detailOpen} onToggle={setDetailOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3.4 — PLAN (modo plan / gate de un delete en modo automático)
// ---------------------------------------------------------------------------
export function PlanCard({
  steps,
  onApprove,
  onReject,
  onOpenHistory,
}: {
  steps: ChatPlanStep[];
  onApprove?: () => void;
  onReject?: () => void;
  onOpenHistory: () => void;
}) {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const deletions = ordered.filter(s => s.action === 'delete');
  const { t, tn } = useForgeLang();
  const intro = tn('chat.card.plan.intro', steps.length);

  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador">{t('chat.card.plan.tag')}</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{t('chat.card.plan.title')}</span>
      </div>
      <p className="fc-accion-cuerpo">{intro}</p>
      <ul className="fc-pasos" style={{ marginBottom: 14 }}>
        {ordered.map((step, i) => (
          <li key={i} className="fc-paso fc-listo">
            <span className="fc-marca" />
            <span>
              {step.summary || step.description}
              {step.action === 'delete' && (
                <span style={{ display: 'block', color: 'rgba(214,40,40,.85)', fontSize: 12 }}>
                  {t('chat.card.plan.deletes', { file: step.file_path })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {deletions.length > 0 && (
        <p className="fc-accion-cuerpo" style={{ fontSize: 12 }}>
          {t('chat.card.plan.deleteNote')}
        </p>
      )}
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn" onClick={onApprove}>{t('chat.card.plan.build')}</button>
        <button type="button" className="fc-accion-btn fc-secundario" disabled title={t('common.comingSoon')}>
          {t('chat.card.plan.edit')}
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          {t('chat.card.fullHistory')}
        </button>
        <button type="button" className="fc-accion-btn fc-rechazar" onClick={onReject}>{t('chat.card.plan.reject')}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RESPUESTA — el turno terminó con TEXTO de la IA (respuesta a una pregunta o
// pregunta de aclaración), no con cambios. Antes caía en RESUMEN y mostraba
// "0 archivos modificados" sin el texto: "el modal no dice nada". Si la IA
// propone una acción (SUGGESTED_ACTION), va como botón.
// ---------------------------------------------------------------------------
export function RespuestaCard({
  text,
  suggestedAction,
  isLoading,
  onSuggestedAction,
  onOpenHistory,
}: {
  text: string;
  suggestedAction?: string;
  isLoading: boolean;
  onSuggestedAction: (action: string) => void;
  onOpenHistory: () => void;
}) {
  const { t } = useForgeLang();
  return (
    <div className="fc-pieza">
      <div className="fc-accion-cuerpo fc-respuesta">
        <MiniMarkdown text={text} />
      </div>
      <div className="fc-accion-fila">
        {suggestedAction && (
          <button
            type="button"
            className="fc-accion-btn"
            disabled={isLoading}
            onClick={() => onSuggestedAction(suggestedAction)}
          >
            {suggestedAction}
          </button>
        )}
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          {t('chat.card.fullHistory')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket 6 — FUNCIONA, PERO AÚN NO SE PUEDE PUBLICAR
// La segunda puerta del Verifier dejó errores de tipos: el preview (esbuild)
// no los ve, pero `tsc -b` en Vercel sí y no construiría. "Arreglar ahora"
// manda al chat un pedido con la lista exacta, igual que "Corregir con IA".
// ---------------------------------------------------------------------------
const TYPE_ERRORS_SHOWN = 8;

/** Pedido que envía "Arreglar ahora": la lista literal, en el idioma elegido. */
export function buildTypeFixPrompt(errors: TypeIssue[]): string {
  const list = errors
    .map((e) => `- ${e.file ?? '?'}${e.line ? `(${e.line},${e.column ?? 0})` : ''}: TS${e.code} ${e.message}`)
    .join('\n');
  return tNow('chat.types.fixPrompt', { list });
}

export function TypeErrorsCard({
  errors,
  isLoading,
  onFix,
}: {
  errors: TypeIssue[];
  isLoading: boolean;
  onFix: (prompt: string) => void;
}) {
  const { t, tn } = useForgeLang();
  const [open, setOpen] = useState(false);
  const shown = errors.slice(0, TYPE_ERRORS_SHOWN);
  const rest = errors.length - shown.length;
  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador"><AlertTriangle size={11} style={{ marginRight: 2 }} />{t('chat.types.tag')}</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{t('chat.types.title')}</span>
      </div>
      <p className="fc-accion-cuerpo">{tn('chat.types.body', errors.length)}</p>
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn" disabled={isLoading} onClick={() => onFix(buildTypeFixPrompt(errors))}>
          {isLoading ? <LoadingSquares size={14} style={{ marginRight: 6 }} /> : null}
          {t('chat.types.fix')}
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t('chat.types.hide') : t('chat.types.show')}
        </button>
      </div>
      {open && (
        <ul className="fc-accion-cuerpo" style={{ margin: '10px 0 0', paddingLeft: 16, fontFamily: 'var(--fc-mono)', fontSize: 12 }}>
          {shown.map((e, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {e.file ?? '?'}{e.line ? `:${e.line}` : ''} — {e.message}
            </li>
          ))}
          {rest > 0 && <li style={{ listStyle: 'none' }}>{t('chat.types.more', { count: rest })}</li>}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3.5 — CANCELADO
// ---------------------------------------------------------------------------
export function CanceladoCard({ steps, completedCount, onResume }: StepsProps & { completedCount: number; onResume: () => void }) {
  const { t } = useForgeLang();
  return (
    <div className="fc-pieza fc-neutra">
      <span className="fc-marcador">{t('chat.card.cancelled.tag')}</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{t('chat.card.cancelled.title')}</span>
      </div>
      <p className="fc-accion-cuerpo">
        {t('chat.card.cancelled.body')}
      </p>
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn" onClick={onResume}>{t('chat.card.cancelled.resume')}</button>
      </div>
      {steps.length > 0 && (
        <>
          <div className="fc-sep" />
          <StepsCollapse steps={steps} completedCount={completedCount} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extra (no está en el mockup, pero quitarla habría sido una regresión real):
// saldo insuficiente / no se pudo arreglar el error de compilar tras 3
// intentos. Mismo look neutro que CANCELADO — tampoco es "acción pendiente".
// ---------------------------------------------------------------------------
export function ErrorCard({
  text,
  errorDetail,
  suggestedAction,
  actionLabel,
  isLoading,
  onSuggestedAction,
}: {
  text: string;
  errorDetail?: string;
  suggestedAction?: string;
  actionLabel?: string;
  isLoading: boolean;
  onSuggestedAction: (action: string) => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const { t } = useForgeLang();
  return (
    <div className="fc-pieza fc-neutra">
      <span className="fc-marcador"><AlertTriangle size={11} style={{ marginRight: 2 }} />{t('chat.card.error.tag')}</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{text}</span>
      </div>
      {errorDetail && (
        <div className="fc-accion-fila" style={{ marginBottom: 10 }}>
          <button type="button" className="fc-accion-btn fc-secundario" onClick={() => setShowDetail(v => !v)}>
            {showDetail ? t('chat.card.error.hide') : t('chat.card.error.show')}
          </button>
        </div>
      )}
      {showDetail && errorDetail && (
        <pre className="fc-accion-cuerpo" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', fontFamily: 'var(--fc-mono)', fontSize: 11 }}>
          {errorDetail}
        </pre>
      )}
      {suggestedAction && (
        <div className="fc-accion-fila">
          <button
            type="button"
            className="fc-accion-btn"
            disabled={isLoading}
            onClick={() => onSuggestedAction(suggestedAction)}
          >
            {isLoading ? <LoadingSquares size={14} style={{ marginRight: 6 }} /> : null}
            {actionLabel ?? suggestedAction}
          </button>
        </div>
      )}
    </div>
  );
}
