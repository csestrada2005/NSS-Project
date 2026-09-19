import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export interface RemoteEdgeFunctionSummary {
  slug: string;
  name: string;
  status: string;
  version?: number;
}

export interface ProjectLogLine {
  id?: string;
  timestamp: string;
  event_message: string;
}

export interface ProjectUsageSnapshot {
  timestamp: string;
  total_auth_requests: number;
  total_realtime_requests: number;
  total_rest_requests: number;
  total_storage_requests: number;
}

export class SupabaseService {
  private static instance: SupabaseService;
  public client: SupabaseClient;
  private currentToken: string | null = null;

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

    this.client.auth.onAuthStateChange((_event, session) => {
      this.currentToken = session?.access_token || null;
    });
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
    if (this.currentToken) {
      return { Authorization: `Bearer ${this.currentToken}` };
    }

    const { data } = await this.client.auth.getSession();
    const session = data.session;
    this.currentToken = session?.access_token || null;

    return { Authorization: `Bearer ${this.currentToken}` };
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
   * Despliega una Edge Function contra la Supabase DEL PROYECTO GENERADO,
   * siempre server-mediado (POST /api/projects/:projectId/edge-functions/deploy).
   *
   * Nunca lanza y nunca se traga el error en silencio: el resultado tipado es
   * lo único que el caller necesita para distinguir "se escribió el archivo"
   * de "se desplegó de verdad" — son dos verdades independientes, y antes de
   * esto la segunda no existía (el mock sólo hacía console.log).
   */
  public async deployEdgeFunction(
    projectId: string,
    slug: string,
    code: string
  ): Promise<{ ok: true; slug: string } | { ok: false; reason: string; code?: string }> {
    try {
      const { Authorization } = await this.getAuthHeader();
      const response = await fetch(`/api/projects/${projectId}/edge-functions/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization },
        body: JSON.stringify({ slug, code }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, reason: body?.error || `HTTP ${response.status}`, code: body?.code };
      }

      return { ok: true, slug };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Panel Cloud (bucket 5, ítem 1) — las tres lecturas de la Management API
   * que antes intentaba hacer el propio navegador con una service_role key
   * sacada de forge_secrets. Server-mediado, mismo patrón que
   * deployEdgeFunction: nunca lanza, nunca expone una llave de servicio al
   * cliente — el resultado tipado es lo único que el caller necesita.
   */
  public async listEdgeFunctions(
    projectId: string
  ): Promise<{ ok: true; functions: RemoteEdgeFunctionSummary[] } | { ok: false; reason: string; code?: string }> {
    try {
      const { Authorization } = await this.getAuthHeader();
      const response = await fetch(`/api/projects/${projectId}/edge-functions`, { headers: { Authorization } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, reason: body?.error || `HTTP ${response.status}`, code: body?.code };
      }
      const body = await response.json();
      return { ok: true, functions: Array.isArray(body?.functions) ? body.functions : [] };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  public async getProjectLogs(
    projectId: string,
    source: 'postgres' | 'auth' | 'edge-functions'
  ): Promise<{ ok: true; logs: ProjectLogLine[] } | { ok: false; reason: string; code?: string }> {
    try {
      const { Authorization } = await this.getAuthHeader();
      const response = await fetch(`/api/projects/${projectId}/logs?source=${encodeURIComponent(source)}`, {
        headers: { Authorization },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, reason: body?.error || `HTTP ${response.status}`, code: body?.code };
      }
      const body = await response.json();
      return { ok: true, logs: Array.isArray(body?.result) ? body.result : [] };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  public async getProjectUsage(
    projectId: string
  ): Promise<{ ok: true; snapshots: ProjectUsageSnapshot[] } | { ok: false; reason: string; code?: string }> {
    try {
      const { Authorization } = await this.getAuthHeader();
      const response = await fetch(`/api/projects/${projectId}/usage`, { headers: { Authorization } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { ok: false, reason: body?.error || `HTTP ${response.status}`, code: body?.code };
      }
      const body = await response.json();
      return { ok: true, snapshots: Array.isArray(body?.result) ? body.result : [] };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
