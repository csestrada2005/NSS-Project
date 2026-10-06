import { useEffect, useRef, useState } from 'react';
import { Upload, RotateCcw } from 'lucide-react';
import { platformService, type ProjectAsset } from '../../services/PlatformService';
import { readAsBase64 } from '../studio/AssetsPanel';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Ícono de la pestaña desde Publicar (bloque 2, 2026-10-06, decisiones de
 * Samuel): uno por proyecto, se aplica al publicar (el código no se toca) y
 * una imagen no cuadrada se encaja sin recortar. Sin IA: no gasta créditos.
 */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export function FaviconPicker({ projectId, autoSvg }: { projectId: string; autoSvg?: string }) {
  const { t } = useForgeLang();
  const [favicon, setFavicon] = useState<ProjectAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    platformService.getFavicon(projectId)
      .then((f) => { if (!cancelled) setFavicon(f); })
      .catch(() => { /* sin dato: se muestra el automático */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const run = async (action: () => Promise<ProjectAsset | null>) => {
    setBusy(true);
    setError(null);
    try {
      setFavicon(await action());
      setChanged(true);
    } catch (e) {
      setError(t('favicon.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run(async () => platformService.uploadFavicon(projectId, { name: file.name, type: file.type, data: await readAsBase64(file) }));
  };

  const reset = () => void run(async () => { await platformService.deleteFavicon(projectId); return null; });

  const src = favicon?.public_url
    ?? (autoSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(autoSvg)}` : null);

  return (
    <div className="bg-background/50 p-4 rounded-lg border border-border">
      <p className="text-sm font-semibold text-foreground mb-3">{t('favicon.title')}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-12 h-12 rounded border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {loading ? <LoadingSquares size={14} /> : src && <img src={src} alt="" className="max-w-full max-h-full object-contain" />}
        </div>
        <div className="flex-1 min-w-[12rem] text-xs text-muted-foreground space-y-1">
          <p className="text-foreground">{favicon ? t('favicon.custom', { name: favicon.original_name }) : t('favicon.auto')}</p>
          <p>{t('favicon.hint')}</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs rounded disabled:opacity-50"
        >
          {busy ? <LoadingSquares size={13} /> : <Upload size={13} />}
          {busy ? t('favicon.uploading') : t('favicon.change')}
        </button>
        {favicon && (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs rounded border border-border disabled:opacity-50"
          >
            <RotateCcw size={13} />
            {t('favicon.reset')}
          </button>
        )}
      </div>
      {changed && !error && <p className="mt-2 text-xs text-primary">{t('favicon.nextPublish')}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
