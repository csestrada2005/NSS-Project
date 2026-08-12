/**
 * PlatformService — singleton that wraps all /api/* calls, automatically
 * attaching the Supabase auth header to every request.
 */

import { SupabaseService } from './SupabaseService';
import { toast } from 'sonner';

/**
 * Structured compile error propagated from esbuild (server/compiler.js) so the
 * Verifier auto-fix can identify the exact offending file/line instead of
 * regex-scraping the flattened error string.
 */
export interface CompileErrorDetail {
  message: string | null;
  file: string | null;
  line: number | null;
  lineText: string | null;
}

class PlatformService {
  // ---------------------------------------------------------------------------
  // Intent correlation (CIRUGÍA: cobro dentro del pipeline servido). One user
  // action ("intent") drives many /api/chat-forge calls (classify → plan →
  // implement → verify). The server accumulates tokens per intent and charges
  // server-side, so every forge request in the pipeline must carry the SAME
  // x-forge-intent-id. The browser runs one intent at a time (the run is gated
  // by an AbortController + generation overlay), so a single "current intent"
  // singleton is safe. userId/tokens are NEVER trusted from the client — the
  // server derives the user from auth and reads token usage from the upstream
  // response; this id only correlates the calls.
  // ---------------------------------------------------------------------------
  private currentIntent: { id: string; projectId?: string; intentType?: string } | null = null;

  /** Open a new intent and return its id. Call once, before the first forge call. */
  beginIntent(meta: { projectId?: string } = {}): string {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.currentIntent = { id, projectId: meta.projectId };
    return id;
  }

  /** Tag the open intent with its classified type (best-effort audit metadata). */
  setIntentType(intentType: string): void {
    if (this.currentIntent) this.currentIntent.intentType = intentType;
  }

  /** Headers correlating a forge request to the open intent (empty if none). */
  getForgeIntentHeaders(): Record<string, string> {
    if (!this.currentIntent) return {};
    const h: Record<string, string> = { 'x-forge-intent-id': this.currentIntent.id };
    if (this.currentIntent.projectId) h['x-forge-project-id'] = this.currentIntent.projectId;
    if (this.currentIntent.intentType) h['x-forge-intent-type'] = this.currentIntent.intentType;
    return h;
  }

  /**
   * Close the open intent. This is an ACCELERATOR: it asks the server to charge
   * the accumulated tokens now so the balance chip refreshes promptly. It is not
   * required for correctness — the server sweeps idle intents and charges them
   * with no client trigger. Best-effort: any failure is swallowed (the sweep
   * still charges). Dispatches forge:credits-updated with the server's fresh
   * balance so the UI updates without a separate wallet read.
   */
  async closeIntent(): Promise<void> {
    const intent = this.currentIntent;
    this.currentIntent = null;
    if (!intent) return;
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/credits/close', {
        method: 'POST',
        headers,
        body: JSON.stringify({ intentId: intent.id }),
      });
      this.handleAuthError(response);
      let detail: { balance: number | null; deducted: number } | undefined;
      if (response.ok || response.status === 402) {
        detail = await response.json().catch(() => undefined);
      }
      window.dispatchEvent(new CustomEvent('forge:credits-updated', { detail }));
    } catch (err) {
      console.warn('[PlatformService] closeIntent failed (sweep will charge):', err);
      // Still nudge the UI to re-read the wallet via its owner_read path.
      window.dispatchEvent(new CustomEvent('forge:credits-updated'));
    }
  }

  private async getHeaders(): Promise<HeadersInit> {
    const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
    return {
      'Content-Type': 'application/json',
      Authorization,
    };
  }

  private handleAuthError(response: Response): void {
    if (response.status === 401) {
      toast.error('Session expired — please refresh the page.');
    }
  }

  /** Proxy a chat request to /api/chat (Anthropic). */
  async callChat(body: object): Promise<Response> {
    try {
      const baseHeaders = await this.getHeaders();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { ...baseHeaders, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      this.handleAuthError(response);
      return response;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Session expired')) {
        toast.error(err.message);
      }
      throw err;
    }
  }

  async callForgeChat(body: object, signal?: AbortSignal): Promise<Response> {
    try {
      const baseHeaders = await this.getHeaders();
      const response = await fetch('/api/chat-forge', {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'anthropic-version': '2023-06-01',
          // Correlate this call to the open intent so the server can accumulate
          // and charge its tokens server-side.
          ...this.getForgeIntentHeaders(),
        },
        body: JSON.stringify(body),
        signal,
      });
      this.handleAuthError(response);
      return response;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Session expired')) {
        toast.error(err.message);
      }
      throw err;
    }
  }

  /**
   * Ask the server for a pool of verified Unsplash images for the given search
   * keywords. The Unsplash key lives only on the server. Best-effort: returns []
   * on any error or when no images are found, so the scaffold falls back to
   * writing DESIGN.md without an image pool.
   */
  async searchImages(
    keywords: string[]
  ): Promise<{ url: string; description: string; author_name: string; author_link: string }[]> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/images/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keywords }),
      });
      this.handleAuthError(response);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.images) ? data.images : [];
    } catch (err) {
      console.warn('[PlatformService] searchImages failed:', err);
      return [];
    }
  }

  /** Check which platform services are configured server-side. */
  async checkPlatformServices(): Promise<Record<string, boolean>> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/platform-check', {
        method: 'POST',
        headers,
      });
      this.handleAuthError(response);
      if (!response.ok) return {};
      return response.json();
    } catch (err) {
      if (err instanceof Error && err.message.includes('Session expired')) {
        toast.error(err.message);
      }
      return {};
    }
  }

  /** Compile project files server-side. */
  async compileSrc(files: Record<string, string>, signal?: AbortSignal): Promise<{ html?: string; error?: string; errorDetail?: CompileErrorDetail | null; errorDetailList?: CompileErrorDetail[] | null }> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers,
        body: JSON.stringify({ files }),
        signal,
      });
      this.handleAuthError(response);
      return response.json();
    } catch (err) {
      if (err instanceof Error && err.message.includes('Session expired')) {
        toast.error(err.message);
        return { error: err.message };
      }
      throw err;
    }
  }

  /** Trigger a managed Vercel deployment for the given project. */
  async deployProject(projectId: string, files: Record<string, string>, projectName: string): Promise<{ url?: string; deploymentId?: string; error?: string }> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`/api/deploy/${projectId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ files, projectName }),
      });
      this.handleAuthError(response);
      return response.json();
    } catch (err) {
      if (err instanceof Error && err.message.includes('Session expired')) {
        toast.error(err.message);
        return { error: err.message };
      }
      throw err;
    }
  }

  /**
   * Preflight credit check at the START of an intent. The server is
   * authoritative for admin / unlimited / free-prompt / balance state. A 402
   * means the user is out of credits and the pipeline must not run. Fails open
   * (allowed:true) on any network/parse error so a transient blip never blocks
   * a paying user.
   */
  async checkCredits(): Promise<{
    allowed: boolean;
    isFreePrompt?: boolean;
    isAdmin?: boolean;
    unlimited?: boolean;
    balance?: number | null;
  }> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/credits/check', { method: 'POST', headers });
      this.handleAuthError(response);
      if (response.status === 402) {
        return { allowed: false, balance: 0 };
      }
      if (!response.ok) return { allowed: true };
      return response.json();
    } catch (err) {
      console.warn('[PlatformService] checkCredits failed (failing open):', err);
      return { allowed: true };
    }
  }

  /**
   * Charge the wallet at the CLOSE of an intent. The server re-derives whether
   * to burn the free prompt, log admin usage, or atomically deduct credits, and
   * returns the NEW balance for the credit chip. Best-effort: on any error we
   * return null so the caller simply refreshes from the wallet instead.
   */
  async deductCredits(params: {
    tokensInput?: number;
    tokensOutput?: number;
    intentType?: string;
    projectId?: string;
  }): Promise<{ balance: number | null; deducted: number } | null> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/credits/deduct', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tokensInput: params.tokensInput ?? 0,
          tokensOutput: params.tokensOutput ?? 0,
          intentType: params.intentType ?? null,
          projectId: params.projectId ?? null,
        }),
      });
      this.handleAuthError(response);
      if (!response.ok && response.status !== 402) return null;
      return response.json();
    } catch (err) {
      console.warn('[PlatformService] deductCredits failed:', err);
      return null;
    }
  }

  /** Get deployment status for a project. */
  async getDeploymentStatus(projectId: string): Promise<{ url: string | null; lastDeployedAt: string | null; status: string }> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`/api/deploy/${projectId}/status`, { headers });
      this.handleAuthError(response);
      return response.json();
    } catch (err) {
      if (err instanceof Error && err.message.includes('Session expired')) {
        toast.error(err.message);
      }
      throw err;
    }
  }
}

export const platformService = new PlatformService();
