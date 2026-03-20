import { useState, useEffect, useCallback } from 'react';
import { Zap, Infinity as InfinityIcon } from 'lucide-react';
import { CreditService } from '../../services/CreditService';
import { useAuth } from '../../contexts/AuthContext';

export default function CreditBalance() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [freePromptUsed, setFreePromptUsed] = useState<boolean>(false);
  const [unlimited, setUnlimited] = useState<boolean>(false);
  const [showModal, setShowModal] = useState(false);
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
          <div className="flex items-center gap-1.5 bg-gray-900/90 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-yellow-400 font-medium">
            <Zap size={12} className="shrink-0" />
            <span>1 free build remaining</span>
          </div>
        ) : isOutOfCredits ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-gray-900/90 border border-red-700/50 rounded-full px-3 py-1.5 text-xs text-red-400 font-medium">
              <Zap size={12} className="shrink-0" />
              <span>0 credits</span>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-full transition-colors"
            >
              Top up
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-gray-900/90 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-gray-300 font-medium">
            <Zap size={12} className="shrink-0 text-yellow-400" />
            <span>{balance.toLocaleString()} credits</span>
          </div>
        )}
      </div>

      {/* Purchase modal (placeholder) */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl pointer-events-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Zap size={20} className="text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-white">Purchase Credits</h2>
              </div>
              <p className="text-gray-400 text-sm mb-6">Purchase credits coming soon</p>
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
