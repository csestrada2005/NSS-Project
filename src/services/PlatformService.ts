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
        headers: { ...baseHeaders, 'anthropic-version': '2023-06-01' },
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
