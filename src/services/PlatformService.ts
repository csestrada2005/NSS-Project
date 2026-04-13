/**
 * PlatformService — singleton that wraps all /api/* calls, automatically
 * attaching the Supabase auth header to every request.
 */

import { SupabaseService } from './SupabaseService';
import { toast } from 'sonner';

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

  async callForgeChat(body: object): Promise<Response> {
    try {
      const baseHeaders = await this.getHeaders();
      const response = await fetch('/api/chat-forge', {
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
  async compileSrc(files: Record<string, string>): Promise<{ html?: string; error?: string }> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers,
        body: JSON.stringify({ files }),
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
