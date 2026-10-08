import { useEffect, useState } from 'react';
import { platformService, type ProjectSecretsResult } from '../../services/PlatformService';
import { SecretValueForm } from '../settings/db/SecretValueForm';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Llaves "como Lovable" en el chat (2026-10-08, decisión de Samuel: detección
 * automática, sin IA). Tras cada pedido —y al abrir el chat— se pregunta al
 * servidor qué llaves piden las funciones del proyecto y faltan; si hay, esta
 * tarjeta las pide con un campo seguro. La llave va directa al servidor del
 * proyecto: no pasa por el chat ni por la IA.
 */
export function MissingSecretsCard({
  projectId,
  checkKey,
  disabled,
}: {
  projectId: string;
  /** Cambia tras cada pedido: vuelve a revisar (y a mostrar si se ocultó). */
  checkKey: number;
  disabled?: boolean;
}) {
  const { t, tn } = useForgeLang();
  const [result, setResult] = useState<ProjectSecretsResult | null>(null);
  const [hidden, setHidden] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHidden(false);
    platformService.listProjectSecrets(projectId, { missingOnly: true })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch(() => { /* sin dato: no se molesta al usuario */ });
    return () => { cancelled = true; };
  }, [projectId, checkKey]);

  const missing = result?.secrets.filter((s) => s.status === 'missing') ?? [];
  if (hidden || (missing.length === 0 && !savedName)) return null;

  const save = async (name: string, value: string) => {
    setError(null);
    try {
      await platformService.setProjectSecret(projectId, name, value);
      setSavedName(name);
      setResult((prev) => prev && { ...prev, secrets: prev.secrets.filter((s) => s.name !== name) });
    } catch {
      setError(t('chat.secrets.failed', { name }));
    }
  };

  return (
    <div className="fc-pieza" style={{ padding: '12px 14px' }}>
      {missing.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: 'var(--fc-texto)', marginBottom: 4 }}>
            {tn('chat.secrets.title', missing.length)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--fc-texto-3)', marginBottom: 10 }}>
            {result?.server === 'none' ? t('secrets.noServer') : t('chat.secrets.hint')}
          </p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {missing.map((s) => (
              <li key={s.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--fc-texto-2)' }}>
                  <span style={{ fontFamily: 'var(--fc-mono)', color: 'var(--fc-texto)' }}>{s.name}</span>
                  {s.usedBy.length > 0 && ` · ${t('secrets.usedBy', { names: s.usedBy.join(', ') })}`}
                </span>
                {result?.server === 'ready' && (
                  <SecretValueForm compact label={s.name} disabled={disabled} onSave={(value) => save(s.name, value)} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {savedName && <p style={{ fontSize: 12, color: 'var(--fc-texto-2)', marginTop: missing.length ? 10 : 0 }}>{t('chat.secrets.saved', { name: savedName })}</p>}
      {error && <p style={{ fontSize: 12, color: 'rgba(248, 113, 113, .9)', marginTop: 8 }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button type="button" className="fc-pill" onClick={() => { setHidden(true); setSavedName(null); }}>
          {missing.length > 0 ? t('chat.secrets.later') : t('common.close')}
        </button>
      </div>
    </div>
  );
}
