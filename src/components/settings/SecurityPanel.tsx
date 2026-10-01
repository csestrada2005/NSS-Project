import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw, Wrench, Database } from 'lucide-react';
import { platformService, type SecurityFinding, type SecurityCheckResult } from '../../services/PlatformService';
import LoadingSquares from '../brand/LoadingSquares';
import { DDLApprovalButton } from '../forge/DDLApprovalButton';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';
import { buildSecurityFixPrompt, filesFingerprint } from '@/utils/securityFix.js';
import type { DdlProposal, ProposalSourceMessage } from '@/utils/ddlProposalState.js';
import type { TypeFixProgress } from '../deploy/DeployManager';

/**
 * Agente de seguridad (decisiones de Samuel, 2026-10-01).
 *  S1 — "Chequeo de seguridad": base REAL + código, reglas fijas, sólo lee
 *       (server/securityCheck.js).
 *  S2 — el último chequeo se guarda (en este navegador) con la huella de los
 *       archivos: si el proyecto cambió después, se avisa. "Arreglar" usa el
 *       mismo mecanismo que "Arreglar ahora" en Publicar; si el arreglo crea
 *       una migración, se aplica AQUÍ mismo y se vuelve a revisar solo.
 */
const STORAGE_PREFIX = 'wyrd_security:';
interface Saved { result: SecurityCheckResult; fingerprint: string }

function loadSaved(projectId?: string | null): Saved | null {
  if (!projectId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** Para Publicar (S3): guarda el resultado del chequeo con que se bloqueó. */
export function saveSecurityResult(projectId: string, result: SecurityCheckResult, files?: Map<string, string>) {
  saveResult(projectId, { result, fingerprint: files ? filesFingerprint(files) : '' });
}

function saveResult(projectId: string, saved: Saved) {
  try {
    localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(saved));
  } catch { /* sin storage: sólo se pierde el recuerdo */ }
}

export function SecurityPanel({
  projectId,
  files,
  onFix,
  ddl,
}: {
  projectId?: string | null;
  files?: Map<string, string>;
  onFix?: (prompt: string, onProgress: (p: TypeFixProgress) => void) => Promise<{ success: boolean; changed: number }>;
  ddl?: {
    proposal: DdlProposal | null;
    getMessages: () => ProposalSourceMessage[];
    onOutcome: (content: string) => void;
  };
}) {
  const { t, lang } = useForgeLang();
  const [saved, setSaved] = useState<Saved | null>(() => loadSaved(projectId));
  const [state, setState] = useState<'idle' | 'checking' | 'fixing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fixProgress, setFixProgress] = useState<TypeFixProgress | null>(null);
  const [beforeCount, setBeforeCount] = useState<number | null>(null);

  useEffect(() => { setSaved(loadSaved(projectId)); }, [projectId]);

  const fingerprint = useMemo(() => (files ? filesFingerprint(files) : ''), [files]);
  const result = saved?.result ?? null;
  const stale = !!saved && !!fingerprint && saved.fingerprint !== fingerprint;

  const run = async () => {
    if (!projectId) return;
    setState('checking');
    setError(null);
    try {
      const next = await platformService.securityCheck(projectId);
      const entry = { result: next, fingerprint };
      saveResult(projectId, entry);
      setSaved(entry);
      setState('idle');
    } catch (e) {
      setError(t('security.failed', { message: e instanceof Error ? e.message : String(e) }));
      setState('error');
    }
  };

  const fix = async () => {
    if (!onFix || !result || result.findings.length === 0) return;
    setBeforeCount(result.findings.length);
    setState('fixing');
    setError(null);
    setFixProgress(null);
    const outcome = await onFix(buildSecurityFixPrompt(result.findings, (k, p) => t(k as ForgeKey, p)), setFixProgress);
    setFixProgress(null);
    if (!outcome.success || outcome.changed === 0) {
      setError(t('security.fixFailed'));
      setState('error');
      return;
    }
    // Si el arreglo creó una migración, la tarjeta de aplicar aparece abajo y
    // el re-chequeo llega al aplicarla; si sólo cambió código, se revisa ya.
    setState('idle');
    if (!ddl?.proposal) await run();
  };

  const graves = result?.findings.filter((f) => f.severity === 'grave') ?? [];
  const avisos = result?.findings.filter((f) => f.severity === 'aviso') ?? [];
  const busy = state === 'checking' || state === 'fixing';
  const pending = ddl?.proposal ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-background/50 p-4 rounded-lg border border-border border-l-4 border-l-primary">
        <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
          <ShieldCheck className="text-primary" size={20} />
          {t('security.title')}
        </h3>
        <p className="text-muted-foreground text-sm mb-4">{t('security.intro')}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={run}
            disabled={!projectId || busy}
            className="nebu-cta px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {state === 'checking' ? <LoadingSquares size={16} /> : result ? <RefreshCw size={16} /> : <ShieldCheck size={16} />}
            {state === 'checking' ? t('security.checking') : result ? t('security.recheck') : t('security.check')}
          </button>
          {result && result.findings.length > 0 && onFix && !pending && (
            <button
              type="button"
              onClick={fix}
              disabled={busy}
              className="px-4 py-2 border border-border hover:bg-accent disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {state === 'fixing' ? <LoadingSquares size={16} /> : <Wrench size={16} />}
              {state === 'fixing' ? t('security.fixing') : t('security.fix')}
            </button>
          )}
        </div>
        {state === 'fixing' && fixProgress && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('security.fixStep', { step: fixProgress.step, total: fixProgress.total })}
            {fixProgress.summary ? ` — ${fixProgress.summary}` : ''}
          </p>
        )}
      </div>

      {state === 'error' && error && (
        <div className="p-3 bg-red-950/60 border border-red-800/40 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {pending && ddl && projectId && (
        <div className="p-4 rounded-lg border border-primary/40 bg-primary/5 text-sm">
          <p className="font-medium text-foreground flex items-center gap-2">
            <Database size={14} /> {t('security.applyTitle')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('security.applyBody', { names: pending.paths.map((p) => p.split('/').pop()).join(', ') })}
          </p>
          <DDLApprovalButton
            proposal={pending}
            projectId={projectId}
            getMessages={ddl.getMessages}
            onOutcome={(content) => {
              ddl.onOutcome(content);
              void run();
            }}
            disabled={busy}
          />
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          {stale && (
            <p className="text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle size={12} /> {t('security.stale')}
            </p>
          )}
          {result.database !== 'checked' && (
            <p className="text-xs text-muted-foreground">
              {t(result.database === 'none' ? 'security.db.none' : 'security.db.unreadable')}
            </p>
          )}
          {result.findings.length === 0 ? (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/40 rounded-lg text-sm text-emerald-300 flex items-center gap-2">
              <ShieldCheck size={16} /> {t('security.clean')}
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground">
                {t('security.summary', { graves: graves.length, avisos: avisos.length })}
              </p>
              <ul className="flex flex-col gap-2">
                {[...graves, ...avisos].map((f, i) => (
                  <FindingRow key={i} finding={f} t={t} />
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {t('security.checkedAt', { when: new Date(result.checkedAt).toLocaleString(lang) })}
            {beforeCount !== null ? ` · ${t('security.before', { count: beforeCount })}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding, t }: { finding: SecurityFinding; t: (k: ForgeKey, p?: Record<string, string | number>) => string }) {
  const grave = finding.severity === 'grave';
  const params = {
    table: finding.table ?? '',
    policy: finding.policy ?? '',
    columns: (finding.columns ?? []).join(', '),
    path: finding.path ?? '',
    identifier: finding.identifier ?? '',
  };
  const key = `security.kind.${finding.kind}` as ForgeKey;
  return (
    <li className={`p-3 rounded-lg border text-sm ${grave ? 'bg-red-950/40 border-red-800/40' : 'bg-amber-950/30 border-amber-800/30'}`}>
      <div className={`flex items-center gap-2 font-medium ${grave ? 'text-red-300' : 'text-amber-300'}`}>
        {grave ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
        {t(grave ? 'security.grave' : 'security.aviso')} · {t(key, params)}
      </div>
      <p className="mt-1 text-muted-foreground text-xs">{t(`${key}.why` as ForgeKey, params)}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {finding.path ?? (finding.policy ? `${finding.table} · "${finding.policy}"` : finding.table)}
      </p>
    </li>
  );
}
