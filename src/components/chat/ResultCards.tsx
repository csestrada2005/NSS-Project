import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { StepsCollapse } from './StepsCollapse';
import { useSqlPreview } from './useSqlPreview';
import { DDLApprovalButton } from '../forge/DDLApprovalButton';
import type { DdlProposal, ProposalSourceMessage } from '@/utils/ddlProposalState.js';
import type { ChatPlanStep } from './types';

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
  return (
    <div className="fc-resumen-texto" style={{ fontSize: 12, marginBottom: 11 }}>
      <b>{count} archivo{count === 1 ? '' : 's'}</b> modificado{count === 1 ? '' : 's'} · compiló sin errores · {seconds}s
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
  return (
    <div className="fc-pieza">
      <div className="fc-resumen">
        <div className="fc-resumen-texto">
          <b>{filesCount} archivo{filesCount === 1 ? '' : 's'}</b> modificado{filesCount === 1 ? '' : 's'} · compiló sin errores · {durationSeconds}s
        </div>
        <button type="button" className="fc-pill" onClick={onOpenHistory}>Ver historial completo</button>
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

  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador">Cambio en base de datos</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">Hay que aprobar esto antes de aplicarlo</span>
      </div>
      <p className="fc-accion-cuerpo">{bodyText} Nada se aplica hasta que lo apruebes.</p>
      <div className="fc-accion-fila">
        <DDLApprovalButton
          proposal={proposal}
          projectId={projectId}
          getMessages={getMessages}
          onOutcome={onOutcome}
          disabled={isReadOnly || isLoading}
        />
        <button type="button" className="fc-accion-btn fc-secundario" onClick={sql.toggle} disabled={sql.loading}>
          {sql.loading ? 'Leyendo…' : sql.open ? 'Ocultar el SQL' : 'Ver el SQL'}
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          Ver historial completo
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
  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador">Revisión de seguridad</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">Wyrd corrigió un permiso abierto</span>
      </div>
      <p className="fc-accion-cuerpo">{warningText}</p>
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn fc-secundario" onClick={() => setDetailOpen(v => !v)}>
          {detailOpen ? 'Ocultar qué cambió' : 'Ver qué cambió'}
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          Ver historial completo
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
  const intro =
    steps.length === 1
      ? 'Esto es lo que Wyrd haría:'
      : `Esto es lo que Wyrd haría (${steps.length} pasos):`;

  return (
    <div className="fc-pieza fc-accion">
      <span className="fc-marcador">Plan listo</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">Esto es lo que Wyrd haría</span>
      </div>
      <p className="fc-accion-cuerpo">{intro}</p>
      <ul className="fc-pasos" style={{ marginBottom: 14 }}>
        {ordered.map((step, i) => (
          <li key={i} className="fc-paso fc-listo">
            <span className="fc-marca" />
            <span>
              {step.description}
              {step.action === 'delete' && (
                <span style={{ display: 'block', color: 'rgba(214,40,40,.85)', fontSize: 12 }}>
                  esto también borra {step.file_path} — no se puede deshacer fácilmente
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {deletions.length > 0 && (
        <p className="fc-accion-cuerpo" style={{ fontSize: 12 }}>
          Aprobar es el techo de lo que puede borrarse, no el piso: una guardia interna revisa cada
          borrado igual y puede rechazar cualquiera de estos.
        </p>
      )}
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn" onClick={onApprove}>Construir</button>
        <button type="button" className="fc-accion-btn fc-secundario" disabled title="Próximamente">
          Editar el plan
        </button>
        <button type="button" className="fc-accion-btn fc-secundario" onClick={onOpenHistory}>
          Ver historial completo
        </button>
        <button type="button" className="fc-accion-btn fc-rechazar" onClick={onReject}>Rechazar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3.5 — CANCELADO
// ---------------------------------------------------------------------------
export function CanceladoCard({ steps, completedCount, onResume }: StepsProps & { completedCount: number; onResume: () => void }) {
  return (
    <div className="fc-pieza fc-neutra">
      <span className="fc-marcador">Detenido por ti</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">Wyrd paró donde iba</span>
      </div>
      <p className="fc-accion-cuerpo">
        Lo que ya había escrito se quedó. Nada a medias se guardó en tu proyecto.
      </p>
      <div className="fc-accion-fila">
        <button type="button" className="fc-accion-btn" onClick={onResume}>Retomar desde aquí</button>
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
  return (
    <div className="fc-pieza fc-neutra">
      <span className="fc-marcador"><AlertTriangle size={11} style={{ marginRight: 2 }} />No se pudo terminar</span>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{text}</span>
      </div>
      {errorDetail && (
        <div className="fc-accion-fila" style={{ marginBottom: 10 }}>
          <button type="button" className="fc-accion-btn fc-secundario" onClick={() => setShowDetail(v => !v)}>
            {showDetail ? 'Ocultar detalle' : '¿Qué salió mal?'}
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
            {isLoading ? <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> : null}
            {actionLabel ?? suggestedAction}
          </button>
        </div>
      )}
    </div>
  );
}
