import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import LoadingSquares from '../../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

/**
 * Campo seguro para pegar una llave (2026-10-08). Lo usan la tarjeta del chat
 * y Ajustes → Secretos. El valor sólo vive aquí hasta que se guarda: se manda
 * al servidor del proyecto y se borra del campo; nunca se vuelve a mostrar.
 */
export function SecretValueForm({
  label,
  onSave,
  submitLabel,
  disabled,
  compact,
}: {
  /** Nombre de la llave, para lectores de pantalla. */
  label: string;
  onSave: (value: string) => Promise<void>;
  submitLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useForgeLang();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(value);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex items-center gap-2 flex-1 min-w-[12rem]"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        placeholder={t('secrets.valuePlaceholder')}
        value={value}
        disabled={disabled || busy}
        onChange={(e) => setValue(e.target.value)}
        className={`flex-1 min-w-0 bg-muted border border-border rounded px-3 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} text-foreground font-mono focus:border-primary focus:outline-none`}
      />
      <button
        type="submit"
        disabled={disabled || busy || !value.trim()}
        className={`flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded font-medium ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
      >
        {busy ? <LoadingSquares size={12} /> : <KeyRound size={compact ? 12 : 14} />}
        {submitLabel ?? t('secrets.setValue')}
      </button>
    </form>
  );
}
