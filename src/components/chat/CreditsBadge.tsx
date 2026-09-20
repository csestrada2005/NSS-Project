import { useCallback, useEffect, useState } from 'react';
import { Zap, Infinity as InfinityIcon } from 'lucide-react';
import { CreditService } from '@/services/CreditService';
import { formatCredits } from '@/lib/creditDisplay';
import { useAuth } from '@/contexts/AuthContext';

/**
 * CreditsBadge — el contador de créditos, arriba del todo (encima de
 * cualquier tarjeta de actividad y de la typebar), pedido explícito
 * 2026-09-20: antes vivía como texto plano en la pista bajo la typebar (ya
 * quitada), ahora es una píldora fija en la parte de arriba del modal —
 * mismo lugar visual que ocupaba, mismo patrón, en cada estado.
 *
 * Mismo dato que CreditBalance.tsx (CreditService.getBalance +
 * 'forge:credits-updated'), sin endpoint nuevo — sólo un render con la
 * paleta Nebu del chat (fc-*) en vez de las clases Tailwind ámbar/genéricas
 * del badge "Admin — Unlimited" original.
 */
export function CreditsBadge() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const [freePromptUsed, setFreePromptUsed] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await CreditService.getBalance(user.id);
      setBalance(data.balance);
      setUnlimited(data.unlimited ?? false);
      setFreePromptUsed(data.freePromptUsed);
    } catch {
      /* informativo — un fallo aquí no debe romper nada más del modal */
    }
  }, [user?.id]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => {
    const handler = () => fetchBalance();
    window.addEventListener('forge:credits-updated', handler);
    return () => window.removeEventListener('forge:credits-updated', handler);
  }, [fetchBalance]);

  if (balance === null) return null;

  const label = unlimited
    ? 'Créditos ilimitados'
    : !freePromptUsed
    ? '1 build gratis disponible'
    : `${formatCredits(balance)} créditos`;

  return (
    <div className={`fc-creditos ${unlimited ? 'fc-ilimitado' : ''}`} style={{ alignSelf: 'flex-end' }}>
      {unlimited ? <InfinityIcon size={12} /> : <Zap size={12} />}
      <span>{label}</span>
    </div>
  );
}
