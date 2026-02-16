import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { webContainerService } from './WebContainerService';

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
   * Generates a migration file content and writes it to the WebContainer filesystem.
   */
  public async generateMigration(description: string, sql: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
    const filename = `${timestamp}_${description.replace(/\s+/g, '_').toLowerCase()}.sql`;
    const path = `supabase/migrations/${filename}`;

    try {
        await webContainerService.writeFile(path, sql);
        console.log(`[SupabaseService] Generated Migration File: ${path}`);
    } catch (e) {
        console.error(`[SupabaseService] Failed to write migration file:`, e);
    }
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
}
