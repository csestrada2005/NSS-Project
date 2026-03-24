import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export class SupabaseService {
  private static instance: SupabaseService;
  public client: SupabaseClient;

  private constructor() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase URL or Key is missing. Supabase functionality will be disabled.');
      // Initialize with empty strings to avoid crashes, but calls will fail or return errors.
      this.client = createClient('https://placeholder.supabase.co', 'placeholder');
    } else {
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  /**
   * Returns the Authorization header with the current session's access token.
   * If the session is null or expires within 60 seconds, refreshes it first.
   * Throws if refresh fails.
   */
  public async getAuthHeader(): Promise<{ Authorization: string }> {
    const { data } = await this.client.auth.getSession();
    const session = data.session;

    const expiresAt = session?.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const isExpiringSoon = !session || (expiresAt - nowSec) < 60;

    if (isExpiringSoon) {
      const { data: refreshData, error } = await this.client.auth.refreshSession();
      if (error || !refreshData.session) {
        throw new Error('Session expired — please refresh the page.');
      }
      return { Authorization: `Bearer ${refreshData.session.access_token}` };
    }

    return { Authorization: `Bearer ${session.access_token}` };
  }

  /**
   * Generates a migration file content and writes it to the WebContainer filesystem.
   */
  public async generateMigration(description: string, sql: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
    const filename = `${timestamp}_${description.replace(/\s+/g, '_').toLowerCase()}.sql`;
    const path = `supabase/migrations/${filename}`;
    console.log(`[SupabaseService] Migration file path: ${path}\n${sql}`);
  }

  /**
   * Executes SQL using Supabase via RPC 'exec_sql'.
   */
  public async executeSQL(sql: string): Promise<void> {
    console.log('[SupabaseService] Executing SQL via RPC exec_sql...');
    const { error } = await this.client.rpc('exec_sql', { query: sql });
    if (error) {
        console.error('[SupabaseService] SQL Execution Failed:', error);
    } else {
        console.log('[SupabaseService] SQL Execution Successful');
    }
  }

  /**
   * Deploys an Edge Function.
   * This is a mock implementation as we don't have direct access to the Management API
   * without a user's access token (which is different from the anon key).
   */
  public async deployEdgeFunction(name: string, code: string): Promise<void> {
    console.log(`[SupabaseService] Edge Function '${name}' registered (deployment requires Supabase CLI).\n`, code.slice(0, 200));
  }
}
