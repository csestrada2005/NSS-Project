import { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { modalBackdropMotion, modalPanelMotion } from './modalMotion';
import { t } from '@/i18n/forge/lang';

/**
 * wyrdConfirm / wyrdPrompt — reemplazan los avisos del navegador
 * (`window.confirm` / `window.prompt`, el recuadro "<dominio> says…") por una
 * ventana con el diseño de Wyrd (Samuel, 2026-10-08). Misma forma de uso que
 * los nativos pero asíncrona: `if (!(await wyrdConfirm({...}))) return;`.
 *
 * Cada llamada monta su propia raíz en <body> y la desmonta al cerrar (tras la
 * animación de salida): no necesita nada montado en el árbol de la app, y el
 * CRM (Nebu Studio) no se toca.
 */
export interface WyrdConfirmOptions {
  message: string;
  /** Sin título: si el mensaje trae "\n\n", la primera parte hace de título. */
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción que borra o pisa algo: botón rojo y el foco empieza en Cancelar. */
  danger?: boolean;
}

export interface WyrdPromptOptions {
  message: string;
  title?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Texto con el que empieza la caja (p. ej. el plan a revisar). */
  defaultValue?: string;
  /**
   * Caja grande de varias líneas (2026-10-08, "Revisar el plan"). Enter hace
   * salto de línea, Ctrl/Cmd+Enter envía, y un clic fuera NO cierra (no se
   * pierde lo escrito).
   */
  multiline?: boolean;
}

type DialogProps =
  | ({ kind: 'confirm' } & WyrdConfirmOptions & { onDone: (value: boolean) => void })
  | ({ kind: 'prompt' } & WyrdPromptOptions & { onDone: (value: string | null) => void });

function splitTitle(title: string | undefined, message: string): { title?: string; body: string } {
  if (title) return { title, body: message };
  const cut = message.indexOf('\n\n');
  return cut === -1 ? { body: message } : { title: message.slice(0, cut), body: message.slice(cut + 2) };
}

function WyrdDialog(props: DialogProps & { onExited: () => void }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(props.kind === 'prompt' ? props.defaultValue ?? '' : '');
  const multiline = props.kind === 'prompt' && !!props.multiline;
  const titleId = useId();
  const bodyId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const danger = props.kind === 'confirm' && props.danger;
  const { title, body } = splitTitle(props.title, props.message);

  const finish = (confirmed: boolean) => {
    if (!open) return;
    setOpen(false);
    if (props.kind === 'confirm') props.onDone(confirmed);
    else props.onDone(confirmed ? value : null);
  };

  useEffect(() => {
    // Como el nativo: el foco entra al diálogo. En lo destructivo, en Cancelar.
    const target = props.kind === 'prompt' ? inputRef.current : danger ? cancelRef.current : confirmRef.current;
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
    if (e.key === 'Tab') {
      // El foco no sale del diálogo.
      const items = [inputRef.current, cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next]?.focus();
    }
  };

  return (
    <AnimatePresence onExitComplete={props.onExited}>
      {open && (
        <>
          <motion.div
            key="backdrop"
            {...modalBackdropMotion}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md"
            onClick={() => { if (!multiline) finish(false); }}
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none p-4">
            <motion.div
              key="panel"
              {...modalPanelMotion}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={bodyId}
              onKeyDown={onKeyDown}
              className={`nebu-modal bg-card border border-border rounded-2xl w-full ${multiline ? 'max-w-2xl' : 'max-w-md'} shadow-2xl pointer-events-auto`}
            >
              <form
                onSubmit={(e) => { e.preventDefault(); finish(true); }}
                className="px-6 py-5 space-y-4"
              >
                <div className="flex gap-3">
                  {danger && <AlertTriangle size={18} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />}
                  <div className="space-y-2 min-w-0">
                    {title && <h2 id={titleId} className="text-sm font-semibold text-foreground whitespace-pre-line">{title}</h2>}
                    <p id={bodyId} className="text-sm text-muted-foreground whitespace-pre-line">{body}</p>
                  </div>
                </div>
                {multiline && (
                  <textarea
                    ref={inputRef}
                    rows={14}
                    spellCheck={false}
                    value={value}
                    placeholder={props.kind === 'prompt' ? props.placeholder : undefined}
                    aria-labelledby={bodyId}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
                    }}
                    className="w-full max-h-[60vh] bg-muted border border-border rounded px-3 py-2 text-sm text-foreground leading-relaxed resize-y focus:border-primary focus:outline-none"
                  />
                )}
                {props.kind === 'prompt' && !multiline && (
                  <input
                    ref={inputRef}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    placeholder={props.placeholder}
                    aria-labelledby={bodyId}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground font-mono focus:border-primary focus:outline-none"
                  />
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    ref={cancelRef}
                    type="button"
                    onClick={() => finish(false)}
                    className="px-4 py-2 rounded text-sm text-muted-foreground hover:text-foreground bg-muted hover:bg-accent border border-border transition-colors"
                  >
                    {props.cancelLabel ?? t('common.cancel')}
                  </button>
                  <button
                    ref={confirmRef}
                    type="submit"
                    disabled={props.kind === 'prompt' && !value.trim()}
                    className="nebu-cta px-4 py-2 rounded text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {props.confirmLabel ?? t('dialog.ok')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function mount<T>(render: (onDone: (value: T) => void, onExited: () => void) => React.ReactElement): Promise<T> {
  return new Promise<T>((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const container = document.createElement('div');
    container.setAttribute('data-wyrd-dialog', '');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onExited = () => {
      root.unmount();
      container.remove();
      previousFocus?.focus?.();
    };
    root.render(render(resolve, onExited));
  });
}

export function wyrdConfirm(options: WyrdConfirmOptions): Promise<boolean> {
  return mount<boolean>((onDone, onExited) => <WyrdDialog kind="confirm" {...options} onDone={onDone} onExited={onExited} />);
}

export function wyrdPrompt(options: WyrdPromptOptions): Promise<string | null> {
  return mount<string | null>((onDone, onExited) => <WyrdDialog kind="prompt" {...options} onDone={onDone} onExited={onExited} />);
}
