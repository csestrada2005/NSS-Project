import { useEffect, useRef, useState } from 'react';
import { Upload, Copy, Check, Trash2, FileText } from 'lucide-react';
import { platformService, type ProjectAsset } from '../../services/PlatformService';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Archivos del proyecto en la pestaña de Código (bloque 1, 2026-10-05): subir
 * fotos y documentos SIN IA (no gasta créditos), ver cuánto ahorró el
 * transformador a WebP y copiar la dirección para usarla en el código.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,application/pdf';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AssetsPanel({ projectId }: { projectId?: string | null }) {
  const { t } = useForgeLang();
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    let cancelled = false;
    platformService.listAssets(projectId)
      .then((list) => { if (!cancelled) setAssets(list); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const upload = async (files: FileList | null) => {
    if (!projectId || !files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const data = await readAsBase64(file);
        const asset = await platformService.uploadAsset(projectId, { name: file.name, type: file.type, data });
        setAssets((prev) => [asset, ...prev]);
      }
    } catch (e) {
      setError(t('assets.uploadFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const copy = async (asset: ProjectAsset) => {
    try {
      await navigator.clipboard.writeText(asset.public_url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* sin portapapeles: se ve la dirección igual */ }
  };

  const remove = async (asset: ProjectAsset) => {
    if (!projectId || !window.confirm(t('assets.confirmDelete', { name: asset.original_name }))) return;
    await platformService.deleteAsset(projectId, asset.id);
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-xl">{t('assets.intro')}</p>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!projectId || uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs rounded disabled:opacity-50"
        >
          {uploading ? <LoadingSquares size={13} /> : <Upload size={13} />}
          {uploading ? t('assets.uploading') : t('assets.upload')}
        </button>
      </div>
      {error && <p className="px-4 pt-3 text-xs text-red-400">{error}</p>}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <LoadingSquares size={16} />
        ) : assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('assets.empty')}</p>
        ) : (
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {assets.map((a) => {
              const saved = a.original_size && a.original_size > a.size_bytes
                ? Math.round((1 - a.size_bytes / a.original_size) * 100)
                : 0;
              return (
                <li key={a.id} className="border border-border rounded overflow-hidden bg-card text-xs">
                  <div className="h-28 bg-muted flex items-center justify-center overflow-hidden">
                    {a.kind === 'document'
                      ? <FileText size={32} className="text-muted-foreground" />
                      : <img src={a.public_url} alt={a.original_name} className="max-h-full max-w-full object-contain" loading="lazy" />}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="truncate text-foreground" title={a.original_name}>{a.original_name}</p>
                    <p className="text-muted-foreground">
                      {saved > 0
                        ? t('assets.saved', { from: formatBytes(a.original_size!), to: formatBytes(a.size_bytes), pct: saved })
                        : formatBytes(a.size_bytes)}
                      {a.width && a.height ? ` · ${a.width}×${a.height}` : ''}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => copy(a)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                        {copiedId === a.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === a.id ? t('assets.copied') : t('assets.copyUrl')}
                      </button>
                      <button type="button" onClick={() => remove(a)} aria-label={t('assets.delete')} className="ml-auto text-muted-foreground hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
