import { SupabaseService } from './SupabaseService';
import { platformService } from './PlatformService';

/**
 * CreditService — read-only client (CIRUGÍA: créditos server-side).
 *
 * The RLS sanitization removed the client's write access to the credit tables,
 * so the client no longer charges itself. This service now only:
 *   - READS the wallet balance for the UI (owner_read RLS still permits this).
 *   - Asks the SERVER whether a call is allowed (preflight) and to settle the
 *     charge at intent close. All wallet WRITES happen server-side with the
 *     service role — see server.js /api/credits/*.
 */
export class CreditService {
  /**
   * Preflight check at the START of an intent. Delegates to the server, which
   * is authoritative for admin / unlimited / free-prompt / balance. When
   * `allowed` is false the caller must NOT run the pipeline (out of credits).
   */
  static async canMakeCall(): Promise<{
    allowed: boolean;
    reason?: string;
    isFreePrompt?: boolean;
    isAdmin?: boolean;
  }> {
    const res = await platformService.checkCredits();
    return {
      allowed: res.allowed,
      reason: res.reason,
      isFreePrompt: res.isFreePrompt ?? false,
      isAdmin: res.isAdmin ?? false,
    };
  }

  /**
   * DEPRECATED (CIRUGÍA: cobro dentro del pipeline servido). The charge is now
   * applied server-side from tokens the server accumulates per intent; the
   * client no longer settles at close (not calling used to mean not paying).
   * Kept as a no-op returning null so any remaining caller compiles without
   * hitting the deprecated /api/credits/deduct endpoint. Balance refresh flows
   * through platformService.closeIntent().
   */
  static async settleIntent(
    intentType: string,
    tokensInput: number,
    tokensOutput: number,
    projectId?: string
  ): Promise<{ balance: number | null; deducted: number } | null> {
    void intentType;
    void tokensInput;
    void tokensOutput;
    void projectId;
    return null;
  }

  /**
   * Get current balance and free-prompt status for a user (READ ONLY).
   * If wallet.unlimited = true, returns Infinity balance.
   */
  static async getBalance(
    userId: string
  ): Promise<{ balance: number; freePromptUsed: boolean; unlimited?: boolean }> {
    try {
      const supabase = SupabaseService.getInstance().client;

      const { data: wallet, error } = await supabase
        .from('forge_credit_wallets')
        .select('balance_credits, free_prompt_used, unlimited')
        .eq('user_id', userId)
        .single();

      if (error || !wallet) {
        return { balance: 0, freePromptUsed: false };
      }

      if (wallet.unlimited) {
        return { balance: Infinity, freePromptUsed: true, unlimited: true };
      }

      return {
        balance: wallet.balance_credits ?? 0,
        freePromptUsed: wallet.free_prompt_used ?? false,
      };
    } catch (e) {
      console.error('[CreditService] getBalance error:', e);
      return { balance: 0, freePromptUsed: false };
    }
  }
}
