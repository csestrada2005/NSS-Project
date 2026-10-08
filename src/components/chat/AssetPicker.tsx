import { useEffect, useState } from 'react';
import { Check, FileText, Lock } from 'lucide-react';
import { platformService, type ProjectAsset } from '../../services/PlatformService';
import { needsReading } from '@/utils/attachmentsNote.js';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Elegir de Archivos al adjuntar (2026-10-08, decisión de Samuel 1A + bonus):
 * reusar fotos y PDFs ya subidos en vez de volver a subirlos. Si ya tienen una
 * lectura guardada, adjuntarlos no gasta créditos (lo dice cada fila).
 */
export function AssetPicker({
  projectId,
  excludeIds,
  onPick,
  onClose,
}: {
  projectId: string;
  /** Ya adjuntos a este mensaje: no se ofrecen otra vez. */
  excludeIds: string[];
  onPick: (assets: ProjectAsset[]) => void;
  onClose: () => void;
}) {
  const { t } = useForgeLang();
  const [assets, setAssets] = useState<ProjectAsset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    platformService.listAssets(projectId)
      .then((list) => { if (!cancelled) setAssets(list.filter((a) => !excludeIds.includes(a.id))); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const note = (a: ProjectAsset) => {
    if (a.has_reading) return t('chat.attach.reused');
    if (!needsReading(a)) return t('chat.attach.urlOnly');
    return a.kind === 'document' ? t('chat.attach.willRead') : t('chat.attach.willSee');
  };

  return (
    <div className="fc-pieza fc-picker" role="dialog" aria-label={t('chat.attach.pickTitle')}>
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{t('chat.attach.pickTitle')}</span>
      </div>
      {failed ? (
        <p className="fc-picker-vacio">{t('chat.attach.pickFailed')}</p>
      ) : assets === null ? (
        <LoadingSquares size={14} />
      ) : assets.length === 0 ? (
        <p className="fc-picker-vacio">{t('chat.attach.pickEmpty')}</p>
      ) : (
        <ul className="fc-picker-lista">
          {assets.map((a) => {
            const on = selected.includes(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={`fc-picker-item ${on ? 'fc-elegido' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(a.id)}
                >
                  <span className="fc-picker-mini">
                    {a.kind === 'document'
                      ? <FileText size={16} />
                      : <img src={a.public_url} alt="" loading="lazy" />}
                  </span>
                  <span className="fc-picker-texto">
                    <span className="fc-picker-nombre" title={a.original_name}>
                      {a.kind === 'document' && !a.public_url && <Lock size={10} aria-hidden="true" />}
                      {a.original_name}
                    </span>
                    <span className="fc-picker-nota">{note(a)}</span>
                  </span>
                  <span className="fc-picker-check" aria-hidden="true">{on && <Check size={13} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="fc-picker-pie">
        <button type="button" className="fc-pill" onClick={onClose}>{t('common.cancel')}</button>
        <button
          type="button"
          className="fc-pill fc-pill-primario"
          disabled={selected.length === 0}
          onClick={() => onPick((assets ?? []).filter((a) => selected.includes(a.id)))}
        >
          {t('chat.attach.pickConfirm', { count: selected.length })}
        </button>
      </div>
    </div>
  );
}
