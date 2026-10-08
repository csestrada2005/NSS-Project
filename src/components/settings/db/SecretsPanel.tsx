import { useState, useEffect, useCallback } from 'react';
import type { ForgeKey } from '@/i18n/forge/en';
import { Plus, Trash2, Cloud, CheckCircle, Circle } from 'lucide-react';
import { platformService, type ProjectSecretsResult } from '@/services/PlatformService';
import { wyrdToast as toast } from '@/utils/wyrdToast';
import LoadingSquares from '../../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { SecretValueForm } from './SecretValueForm';

interface SecretsPanelProps {
  projectId: string | null | undefined;
}

/**
 * Llaves "como Lovable" (2026-10-08, decisiones de Samuel): viven SÓLO en el
 * servidor del proyecto. Qué llaves faltan lo dice el código de sus funciones
 * (server/projectSecrets.js), no una lista fija. Nunca se muestra un valor:
 * se guarda, se reemplaza o se borra. La tabla vieja forge_secrets ya no se
 * usa (estaba vacía: 0 llaves, consulta de Samuel 2026-10-08).
 */
const NAME_RE = /^[A-Z][A-Z0-9_]{0,99}$/;

// Sin marcas de infraestructura (Samuel, 2026-10-05): sólo se nombra al
// proveedor cuando el usuario conecta SU propia cuenta (GitHub, Stripe).
const PLATFORM_LABELS: Record<string, ForgeKey> = {
  anthropic: 'platform.ai',
  googlePsi: 'platform.speed',
  cloudflare: 'platform.domains',
  vercel: 'platform.publish',
  resend: 'platform.email',
  supabase: 'platform.db',
};

const STATUS_STYLE: Record<string, string> = {
  missing: 'text-amber-300 border-amber-700/50 bg-amber-900/20',
  set: 'text-emerald-300 border-emerald-800/50 bg-emerald-950/40',
  unused: 'text-muted-foreground border-border bg-muted',
};

export function SecretsPanel({ projectId }: SecretsPanelProps) {
  const { t } = useForgeLang();
  const [result, setResult] = useState<ProjectSecretsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [platformServices, setPlatformServices] = useState<Record<string, boolean> | null>(null);
  const [loadingPlatform, setLoadingPlatform] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setResult(null); return; }
    setLoading(true);
    try {
      setResult(await platformService.listProjectSecrets(projectId));
    } catch {
      setResult({ server: 'error', secrets: [] });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    platformService.checkPlatformServices()
      .then(setPlatformServices)
      .catch(() => setPlatformServices({}))
      .finally(() => setLoadingPlatform(false));
  }, [load]);

  const save = async (name: string, value: string) => {
    if (!projectId) return;
    try {
      await platformService.setProjectSecret(projectId, name, value);
      toast.success(t('secrets.saved', { key: name }));
      await load();
    } catch (e) {
      toast.error(t('secrets.saveFailed', { key: name }));
      throw e;
    }
  };

  const remove = async (name: string) => {
    if (!projectId || !window.confirm(t('secrets.confirmRemove', { key: name }))) return;
    try {
      await platformService.deleteProjectSecret(projectId, name);
      toast.success(t('secrets.deleted', { key: name }));
      await load();
    } catch {
      toast.error(t('secrets.deleteFailed', { key: name }));
    }
  };

  const nameTrimmed = newName.trim();
  const nameInvalid = nameTrimmed.length > 0 && (!NAME_RE.test(nameTrimmed) || nameTrimmed.startsWith('SUPABASE_'));
  const canWrite = result?.server === 'ready';

  return (
    <div className="space-y-6">
      {!projectId && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 text-sm text-amber-300 flex items-center gap-2">
          <Cloud size={16} />
          {t('secrets.openProject')}
        </div>
      )}

      {/* Platform services (read-only) */}
      <div className="bg-background/50 rounded-xl p-4 border border-border border-l-4 border-l-primary">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('secrets.platform')}</h3>
        {loadingPlatform ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoadingSquares size={12} />
            {t('secrets.checking')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PLATFORM_LABELS).map(([key, label]) => {
              const connected = platformServices?.[key] ?? false;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  {connected
                    ? <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                    : <Circle size={12} className="text-muted-foreground/40 shrink-0" />}
                  <span className={connected ? 'text-foreground' : 'text-muted-foreground'}>{t(label)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">{t('secrets.platformNote')}</p>
      </div>

      {/* Llaves del proyecto: viven en el servidor del proyecto */}
      {projectId && (
        <div className="bg-background/50 rounded-lg p-4 border border-border border-l-4 border-l-primary space-y-4">
          <p className="text-sm text-muted-foreground">{t('secrets.projectIntro')}</p>

          {result?.server === 'none' && (
            <p className="text-xs text-amber-300">{t('secrets.noServer')}</p>
          )}
          {(result?.server === 'unavailable' || result?.server === 'error') && (
            <p className="text-xs text-red-300">{t('secrets.unavailable')}</p>
          )}

          {loading && !result ? (
            <LoadingSquares size={16} />
          ) : (result?.secrets.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t('secrets.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {result!.secrets.map((s) => (
                <li key={s.name} className="p-3 rounded border border-border bg-muted/40 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-foreground break-all">{s.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded border ${STATUS_STYLE[s.status]}`}>
                      {t(`secrets.status.${s.status}` as ForgeKey)}
                    </span>
                    {s.usedBy.length > 0 && (
                      <span className="text-xs text-muted-foreground">{t('secrets.usedBy', { names: s.usedBy.join(', ') })}</span>
                    )}
                    {s.status !== 'missing' && canWrite && (
                      <button
                        type="button"
                        onClick={() => remove(s.name)}
                        className="ml-auto p-1.5 text-muted-foreground hover:text-red-400"
                        aria-label={t('secrets.remove', { key: s.name })}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {canWrite && (
                    <SecretValueForm
                      compact
                      label={s.name}
                      locked={s.status !== 'missing'}
                      confirmMessage={s.usedBy.length > 0
                        ? t('secrets.confirmReplace', { key: s.name, names: s.usedBy.join(', ') })
                        : t('secrets.confirmReplaceUnused', { key: s.name })}
                      onSave={(value) => save(s.name, value)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Plus size={12} />{t('secrets.add')}</p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t('secrets.keyPlaceholder')}
                  placeholder={t('secrets.keyPlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.toUpperCase())}
                  className="flex-1 min-w-[12rem] bg-muted border border-border rounded px-3 py-2 text-sm text-foreground font-mono focus:border-primary focus:outline-none"
                />
                <SecretValueForm
                  label={nameTrimmed || t('secrets.valuePlaceholder')}
                  disabled={!nameTrimmed || nameInvalid}
                  onSave={async (value) => { await save(nameTrimmed, value); setNewName(''); }}
                />
              </div>
              {nameInvalid && <p className="text-xs text-red-300">{t('secrets.badName')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
