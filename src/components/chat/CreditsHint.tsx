import { useCallback, useEffect, useState } from 'react';
import { CreditService } from '@/services/CreditService';
import { formatCredits } from '@/lib/creditDisplay';
import { useAuth } from '@/contexts/AuthContext';

/**
 * CreditsHint — el número de créditos en la pista bajo la typebar (1.4).
 *
 * Mismo dato que `CreditBalance.tsx` (CreditService.getBalance +
 * 'forge:credits-updated'), en texto plano en vez del pill con fondo/borde:
 * el mockup pinta la pista como texto mono suelto, no un badge. No se creó
 * ningún endpoint nuevo — es el mismo fetch, sólo con otro render.
 */
export function CreditsHint() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await CreditService.getBalance(user.id);
      setBalance(data.balance);
      setUnlimited(data.unlimited ?? false);
    } catch {
      /* la pista de créditos es informativa — un fallo aquí no debe romper nada más */
    }
  }, [user?.id]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => {
    const handler = () => fetchBalance();
    window.addEventListener('forge:credits-updated', handler);
    return () => window.removeEventListener('forge:credits-updated', handler);
  }, [fetchBalance]);

  if (balance === null) return null;
  return <span>{unlimited ? 'Créditos ilimitados' : `${formatCredits(balance)} créditos`}</span>;
}
