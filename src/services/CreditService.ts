import { SupabaseService } from './SupabaseService';

export class CreditService {
  /**
   * Check whether a user is allowed to make an AI call.
   * Rules:
   *  0. If user is admin → always allowed (unlimited).
   *  1. If wallet.unlimited = true → always allowed.
   *  2. If free_prompt_used is false → allow ONE call (up to 100k tokens).
   *  3. If balance_credits > 0 → allow.
   *  4. Otherwise → block.
   */
  static async canMakeCall(
    userId: string
  ): Promise<{ allowed: boolean; reason?: string; isFreePrompt?: boolean; isAdmin?: boolean }> {
    try {
      const supabase = SupabaseService.getInstance().client;

      // Check if user is admin
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileData?.role === 'admin') {
        return { allowed: true, isFreePrompt: false, isAdmin: true };
      }

      const { data: wallet, error } = await supabase
        .from('forge_credit_wallets')
        .select('balance_credits, free_prompt_used, unlimited')
        .eq('user_id', userId)
        .single();

      if (error || !wallet) {
        // No wallet row yet — treat as new user with free prompt available
        await supabase.from('forge_credit_wallets').upsert({
          user_id: userId,
          balance_credits: 0,
          free_prompt_used: false,
        });
        return { allowed: true, isFreePrompt: true };
      }

      if (wallet.unlimited) {
        return { allowed: true, isFreePrompt: false, isAdmin: true };
      }

      if (!wallet.free_prompt_used) {
        return { allowed: true, isFreePrompt: true };
      }

      if ((wallet.balance_credits ?? 0) > 0) {
        return { allowed: true, isFreePrompt: false };
      }

      return { allowed: false, reason: 'insufficient_credits' };
    } catch (e) {
      console.error('[CreditService] canMakeCall error:', e);
      // Fail open — don't block users on DB errors
      return { allowed: true, isFreePrompt: false };
    }
  }

  /**
   * Mark the free prompt as used for a user.
   */
  static async markFreePromptUsed(userId: string): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('forge_credit_wallets')
        .update({ free_prompt_used: true })
        .eq('user_id', userId);
    } catch (e) {
      console.error('[CreditService] markFreePromptUsed error:', e);
    }
  }

  /**
   * Deduct credits after a successful AI call.
   * If wallet.unlimited = true: log an admin_usage transaction but do NOT deduct.
   * Formula:
   *  - Input cost  = (tokensInput  / 1_000_000) * 3.00
   *  - Output cost = (tokensOutput / 1_000_000) * 15.00
   *  - Total USD → * 300 = credits
   *  - Round up to nearest integer
   */
  static async deductCredits(
    userId: string,
    tokensInput: number,
    tokensOutput: number,
    projectId?: string
  ): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;

      // Check if wallet is unlimited (admin)
      const { data: wallet } = await supabase
        .from('forge_credit_wallets')
        .select('balance_credits, unlimited')
        .eq('user_id', userId)
        .single();

      const inputCost = (tokensInput / 1_000_000) * 3.0;
      const outputCost = (tokensOutput / 1_000_000) * 15.0;
      const totalCostUsd = inputCost + outputCost;
      const creditsToDeduct = Math.ceil(totalCostUsd * 300);

      if (wallet?.unlimited) {
        // Log usage for auditing but don't deduct
        if (creditsToDeduct > 0) {
          await supabase.from('forge_credit_transactions').insert({
            user_id: userId,
            project_id: projectId ?? null,
            type: 'admin_usage',
            tokens_input: tokensInput,
            tokens_output: tokensOutput,
            cost_usd: totalCostUsd,
            amount_credits: 0,
          });
        }
        return;
      }

      if (creditsToDeduct === 0) return;

      // Insert transaction row
      await supabase.from('forge_credit_transactions').insert({
        user_id: userId,
        project_id: projectId ?? null,
        type: 'spend',
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        cost_usd: totalCostUsd,
        amount_credits: -creditsToDeduct,
      });

      // Deduct from wallet (prevent going below 0)
      const currentBalance = wallet?.balance_credits ?? 0;
      const newBalance = Math.max(0, currentBalance - creditsToDeduct);

      await supabase
        .from('forge_credit_wallets')
        .update({ balance_credits: newBalance })
        .eq('user_id', userId);
    } catch (e) {
      console.error('[CreditService] deductCredits error:', e);
    }
  }

  /**
   * Get current balance and free-prompt status for a user.
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
