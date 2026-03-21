import { useState, useEffect, useCallback } from 'react';
import { Zap, Infinity as InfinityIcon } from 'lucide-react';
import { CreditService } from '../../services/CreditService';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function CreditBalance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);
  const [freePromptUsed, setFreePromptUsed] = useState<boolean>(false);
  const [unlimited, setUnlimited] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await CreditService.getBalance(user.id);
      setBalance(data.balance);
      setFreePromptUsed(data.freePromptUsed);
      setUnlimited(data.unlimited ?? false);
    } catch (e) {
      console.error('[CreditBalance] fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    const handler = () => fetchBalance();
    window.addEventListener('forge:credits-updated', handler);
    return () => window.removeEventListener('forge:credits-updated', handler);
  }, [fetchBalance]);

  if (isLoading || !user) return null;

  // Admin unlimited badge
  if (unlimited) {
    return (
      <div className="flex items-center gap-1.5 bg-amber-950/80 border border-amber-600/50 rounded-full px-3 py-1.5 text-xs text-amber-400 font-medium">
        <InfinityIcon size={12} className="shrink-0" />
        <span>Admin — Unlimited</span>
      </div>
    );
  }

  const isOutOfCredits = freePromptUsed && balance === 0;
  const showFreePrompt = !freePromptUsed;

  return (
    <>
      {/* Credit pill */}
      <div className="flex items-center gap-2">
        {showFreePrompt ? (
          <div className="flex items-center gap-1.5 bg-background/90 border border-border rounded-full px-3 py-1.5 text-xs text-yellow-400 font-medium">
            <Zap size={12} className="shrink-0" />
            <span>1 free build remaining</span>
          </div>
        ) : isOutOfCredits ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-background/90 border border-primary/50 rounded-full px-3 py-1.5 text-xs text-primary font-medium">
              <Zap size={12} className="shrink-0" />
              <span>0 credits</span>
            </div>
            <button
              onClick={() => { toast('Credit packages coming soon'); navigate('/forge'); }}
              className="text-xs text-primary hover:underline"
            >
              Buy credits
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-background/90 border border-border rounded-full px-3 py-1.5 text-xs text-foreground font-medium">
            <Zap size={12} className="shrink-0 text-yellow-400" />
            <span>{balance.toLocaleString()} credits</span>
          </div>
        )}
      </div>

    </>
  );
}
