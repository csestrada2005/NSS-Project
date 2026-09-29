/**
 * MigrationApplyModal — la última puerta antes de lo irreversible.
 *
 * POR QUÉ HAY DOS PUERTAS Y NO UNA
 * --------------------------------
 * Aplicar una migración es la única operación del sistema que no tiene
 * deshacer, pero no todas pesan igual. Un `CREATE TABLE` que sale mal se
 * arregla con otra migración; un `DROP TABLE users` se lleva los datos y no hay
 * segunda oportunidad. Un único "¿seguro?" para las dos cosas se convierte en
 * un reflejo: se pulsa sin leer, y entonces deja de proteger justo cuando hacía
 * falta.
 *
 * Por eso el modal tiene dos modos, y quién decide cuál NO es este componente
 * sino ddlGuard (determinista y con tests):
 *
 *  - No destructivo → confirmación simple. Un botón, y a correr.
 *  - Destructivo    → se enseñan las sentencias EXACTAS que ddlGuard marcó, con
 *                     su archivo y su línea, y el botón sigue muerto hasta que
 *                     el usuario TECLEA el nombre del objeto que va a destruir.
 *                     Escribirlo obliga a leerlo, que es todo el punto.
 *
 * Cancelar no toca nada: ni la base, ni el archivo, ni el estado de la
 * propuesta. La migración sigue exactamente donde estaba, ejecutable.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { modalBackdropMotion, modalPanelMotion } from '@/components/ui/modalMotion';
import type { DestructiveFinding } from '@/utils/ddlGuard.js';
import {
  DROP,
  TRUNCATE,
  DELETE_WITHOUT_WHERE,
  DROP_COLUMN,
  isTargetConfirmed,
} from '@/utils/ddlGuard.js';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';

/** Un hallazgo destructivo, con el archivo del que salió. */
export interface FlaggedStatement {
  path: string;
  finding: DestructiveFinding;
}

interface Props {
  /** Migraciones que se van a aplicar, en orden. */
  paths: string[];
  /** Hallazgos de ddlGuard. Vacío → confirmación simple. */
  flagged: FlaggedStatement[];
  /** Nombres de los objetos afectados; el primero es el que hay que teclear. */
  targets: string[];
  /** Ejecución en curso: el modal se queda, deshabilitado, hasta el veredicto. */
  isApplying: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Qué hace exactamente cada tipo de hallazgo, en una línea. */
const KIND_LABEL: Record<string, ForgeKey> = {
  [DROP]: 'ddl.kind.drop',
  [TRUNCATE]: 'ddl.kind.truncate',
  [DELETE_WITHOUT_WHERE]: 'ddl.kind.deleteAll',
  [DROP_COLUMN]: 'ddl.kind.dropColumn',
};

/** El nombre del archivo, sin el prefijo de directorio que se repite en todos. */
function fileName(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? path : path.slice(cut + 1);
}

export function MigrationApplyModal({
  paths,
  flagged,
  targets,
  isApplying,
  onCancel,
  onConfirm,
}: Props) {
  const isDestructive = flagged.length > 0;
  const { t, tn } = useForgeLang();
  // El objeto que hay que teclear: el PRIMERO que se destruye, en orden de
  // archivo. Un lote puede tocar varios (`targets` los trae todos, y los demás
  // se listan bajo el input) pero la confirmación es una. Si ddlGuard marcó
  // algo destructivo y no supo nombrarlo, `required` viene vacío y no hay
  // confirmación posible: fail-closed, ver abajo.
  const required = targets[0] ?? '';
  const [typed, setTyped] = useState('');

  // La regla de coincidencia vive en ddlGuard, con tests: qué desbloquea el
  // botón rojo no es algo que deba leerse en un JSX para saberlo.
  const matches = isTargetConfirmed(typed, required);
  // Un destructivo sin nombre legible NO se puede confirmar aquí. Es el caso
  // que no debería darse (las cuatro formas que ddlGuard marca nombran algo);
  // si se da, la salida honesta es no ofrecer el botón, no inventarse una
  // confirmación más débil para lo más peligroso del sistema.
  const unnameable = isDestructive && required.length === 0;
  const canConfirm = !isApplying && !unnameable && (!isDestructive || matches);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isApplying, onCancel]);

  return (
    <>
      <motion.div
        {...modalBackdropMotion}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
        onClick={() => { if (!isApplying) onCancel(); }}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <motion.div
          {...modalPanelMotion}
          className="nebu-modal bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              {isDestructive && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
              {isDestructive ? t('ddl.modal.destructiveTitle') : t('ddl.modal.title')}
            </h2>
            <button
              onClick={onCancel}
              disabled={isApplying}
              className="text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              aria-label={t('common.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                {tn('ddl.modal.intro', paths.length)}
              </p>
              <ul className="font-mono text-xs text-foreground space-y-0.5">
                {paths.map(path => (
                  <li key={path}>{fileName(path)}</li>
                ))}
              </ul>
            </div>

            {isDestructive && (
              <div className="rounded-lg border border-amber-600/40 bg-amber-950/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-300">
                  {tn('ddl.modal.flagged', flagged.length)}
                </p>
                {flagged.map(({ path, finding }, index) => (
                  <div key={`${path}:${finding.line}:${index}`} className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-wide text-amber-400/80">
                      {fileName(path)}:{finding.line} — {KIND_LABEL[finding.kind] ? t(KIND_LABEL[finding.kind]) : finding.kind}
                    </div>
                    <pre className="text-[11px] text-amber-200 bg-black/40 border border-amber-800/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {finding.statement}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {unnameable && (
              <p className="text-xs text-amber-400">
                {t('ddl.modal.unnameable')}
              </p>
            )}

            {isDestructive && !unnameable && (
              <div className="space-y-2">
                <label htmlFor="ddl-confirm-target" className="text-xs text-muted-foreground block">
                  {t('ddl.modal.typeBefore')} <span className="font-mono font-semibold text-foreground">{required}</span>{' '}
                  {t('ddl.modal.typeAfter')}
                  {targets.length > 1 && (
                    <span className="block text-[10px] mt-0.5">
                      {t('ddl.modal.alsoAffected', { targets: targets.slice(1).join(', ') })}
                    </span>
                  )}
                </label>
                <input
                  id="ddl-confirm-target"
                  type="text"
                  value={typed}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isApplying}
                  onChange={e => setTyped(e.target.value)}
                  placeholder={required}
                  className="w-full bg-accent text-foreground border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-muted-foreground/50 disabled:opacity-50"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
            <button
              onClick={onCancel}
              disabled={isApplying}
              className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              {t('common.cancel')}
            </button>
            {!unnameable && (
              <button
                onClick={onConfirm}
                disabled={!canConfirm}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDestructive ? 'bg-amber-500 hover:bg-amber-400 text-black font-semibold' : 'bg-primary hover:bg-primary/90 text-white'
                }`}
              >
                {isApplying && <LoadingSquares size={16} />}
                {isApplying ? t('ddl.button.applying') : isDestructive ? t('ddl.modal.destroyApply') : t('ddl.modal.apply')}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
