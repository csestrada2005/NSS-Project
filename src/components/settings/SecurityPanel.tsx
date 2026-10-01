import { useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { platformService, type SecurityFinding, type SecurityCheckResult } from '../../services/PlatformService';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';

/**
 * Agente de seguridad — S1 (2026-10-01, decisiones de Samuel): "Chequeo de
 * seguridad" revisa la base REAL del proyecto y su código con reglas fijas
 * (server/securityCheck.js). Sólo lee. Lo grave bloqueará Publicar (S3); el
 * botón "Arreglar" llega en S2.
 */
export function SecurityPanel({ projectId }: { projectId?: string | null }) {
  const { t, lang } = useForgeLang();
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SecurityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!projectId) return;
    setState('checking');
    setError(null);
    try {
      setResult(await platformService.securityCheck(projectId));
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };

  const graves = result?.findings.filter((f) => f.severity === 'grave') ?? [];
  const avisos = result?.findings.filter((f) => f.severity === 'aviso') ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-background/50 p-4 rounded-lg border border-border border-l-4 border-l-primary">
        <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
          <ShieldCheck className="text-primary" size={20} />
          {t('security.title')}
        </h3>
        <p className="text-muted-foreground text-sm mb-4">{t('security.intro')}</p>
        <button
          type="button"
          onClick={run}
          disabled={!projectId || state === 'checking'}
          className="nebu-cta px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {state === 'checking' ? <LoadingSquares size={16} /> : state === 'done' ? <RefreshCw size={16} /> : <ShieldCheck size={16} />}
          {state === 'checking' ? t('security.checking') : state === 'done' ? t('security.recheck') : t('security.check')}
        </button>
      </div>

      {state === 'error' && error && (
        <div className="p-3 bg-red-950/60 border border-red-800/40 rounded-lg text-sm text-red-300">
          {t('security.failed', { message: error })}
        </div>
      )}

      {state === 'done' && result && (
        <div className="flex flex-col gap-3">
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
            {t('security.checkedAt', { when: new Date(result.checkedAt).toLocaleTimeString(lang) })}
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
