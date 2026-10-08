import { useRef, useState } from 'react';
import { KeyRound, Pencil } from 'lucide-react';
import LoadingSquares from '../../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { wyrdConfirm } from '@/components/ui/wyrdDialog';

const MASK = '••••••••••••••••';

/**
 * Campo seguro para pegar una llave (2026-10-08). Lo usan la tarjeta del chat
 * y Ajustes → Secretos. El valor sólo vive aquí hasta que se guarda: se manda
 * al servidor del proyecto y se borra del campo; nunca se vuelve a mostrar.
 *
 * `locked` (llave ya guardada, pedido de Samuel 2026-10-08): se ve como un
 * secreto (puntitos) con "Reemplazar"; al pulsarlo se abre vacío y, al
 * guardar, `confirmMessage` pide confirmación antes de pisar la anterior.
 */
export function SecretValueForm({
  label,
  onSave,
  submitLabel,
  disabled,
  compact,
  locked,
  confirmMessage,
}: {
  /** Nombre de la llave, para lectores de pantalla. */
  label: string;
  onSave: (value: string) => Promise<void>;
  submitLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  locked?: boolean;
  confirmMessage?: string;
}) {
  const { t } = useForgeLang();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const showMask = locked && !editing;

  const submit = async () => {
    if (!value.trim() || busy) return;
    if (locked && confirmMessage && !(await wyrdConfirm({ message: confirmMessage, confirmLabel: t('secrets.replace'), danger: true }))) return;
    setBusy(true);
    try {
      await onSave(value);
      setValue('');
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const startReplace = () => {
    setEditing(true);
    // El campo se habilita en el siguiente render.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const size = compact ? 'py-1.5 text-xs' : 'py-2 text-sm';
  const button = `flex items-center gap-1.5 rounded font-medium disabled:opacity-50 ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`;

  return (
    <form
      className="flex items-center gap-2 flex-1 min-w-[12rem]"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <input
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        placeholder={showMask ? MASK : t('secrets.valuePlaceholder')}
        value={value}
        readOnly={showMask}
        disabled={disabled || busy}
        onChange={(e) => setValue(e.target.value)}
        className={`flex-1 min-w-0 bg-muted border border-border rounded px-3 ${size} text-foreground font-mono focus:border-primary focus:outline-none ${showMask ? 'placeholder:text-foreground/70 cursor-default' : ''}`}
      />
      {showMask ? (
        <button
          type="button"
          onClick={startReplace}
          disabled={disabled}
          className={`${button} bg-primary hover:bg-primary/90 text-white`}
        >
          <Pencil size={compact ? 12 : 14} />
          {t('secrets.replace')}
        </button>
      ) : (
        <>
          <button
            type="submit"
            disabled={disabled || busy || !value.trim()}
            className={`${button} bg-primary hover:bg-primary/90 text-white`}
          >
            {busy ? <LoadingSquares size={12} /> : <KeyRound size={compact ? 12 : 14} />}
            {submitLabel ?? t('secrets.setValue')}
          </button>
          {locked && (
            <button
              type="button"
              onClick={() => { setEditing(false); setValue(''); }}
              disabled={busy}
              className={`${button} bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border`}
            >
              {t('secrets.cancel')}
            </button>
          )}
        </>
      )}
    </form>
  );
}
