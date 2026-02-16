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
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  /**
   * Generates a migration file content and logs it (simulating file creation).
   * In a real environment, this would write to supabase/migrations.
   */
  public generateMigration(description: string, sql: string): void {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
    const filename = `${timestamp}_${description.replace(/\s+/g, '_').toLowerCase()}.sql`;

    console.log(`[SupabaseService] Generated Migration File: supabase/migrations/${filename}`);
    console.log(`[SupabaseService] Content:\n${sql}`);

    // In a browser environment, we can't write to the filesystem directly.
    // If we wanted to download it:
    // const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
    // saveAs(blob, filename);
  }

  /**
   * Executes SQL using Supabase.
   * Note: The standard JS client does not support raw SQL execution via the Management API
   * without a Service Role Key or a specific RPC function setup.
   * If no suitable key is found (only Anon key), we just log the action.
   */
  public async executeSQL(sql: string): Promise<void> {
    // Check if we have a service role key available (simulated check)
    // In a real app, you wouldn't expose the service role key to the client.
    // So this is likely falling back to logging.

    // For this implementation, we assume we don't have admin rights in the client.
    console.log('[SupabaseService] Executing SQL (Simulated - No Admin Key):');
    console.log(sql);

    // If we had an RPC function `exec_sql`, we could call it:
    // const { error } = await this.client.rpc('exec_sql', { query: sql });
    // if (error) console.error('Error executing SQL:', error);
  }
}
