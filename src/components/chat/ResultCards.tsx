import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StepsCollapse } from './StepsCollapse';
import { useSqlPreview } from './useSqlPreview';
import { DDLApprovalButton } from '../forge/DDLApprovalButton';
import type { DdlProposal, ProposalSourceMessage } from '@/utils/ddlProposalState.js';
import type { ChatPlanStep } from './types';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

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
