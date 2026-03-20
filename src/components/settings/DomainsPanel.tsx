import { useState, useEffect, useRef } from 'react';
import { Globe, Plus, Trash2, Loader2, CheckCircle, Clock, AlertCircle, Info, Copy } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface Domain {
  id: string;
  domain: string;
  status: 'pending' | 'active' | 'error';
  created_at: string;
}

interface DomainsPanelProps {
  projectId: string | null;
}

async function getAuthHeader() {
  const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
  return { 'Content-Type': 'application/json', Authorization };
}

export function DomainsPanel({ projectId }: DomainsPanelProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!projectId) { setIsLoading(false); return; }
    loadDomains();
    loadDeploymentUrl();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [projectId]);

  // Auto-refresh while any domain is pending
  useEffect(() => {
    const hasPending = domains.some(d => d.status === 'pending');
    if (hasPending && projectId) {
      pollRef.current = setTimeout(() => loadDomains(), 15000);
    }
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [domains]);

  const loadDeploymentUrl = async () => {
    if (!projectId) return;
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/deploy/${projectId}/status`, { headers });
      const data = await response.json();
      setDeploymentUrl(data.url);
    } catch { /* ignore */ }
  };

  const loadDomains = async () => {
    if (!projectId) return;
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/domains/${projectId}`, { headers });
      const data = await response.json();
      setDomains(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load domains');
    } finally {
      setIsLoading(false);
    }
  };

  const connectDomain = async () => {
    if (!newDomain.trim() || !projectId) return;
    setIsConnecting(true);
    setError(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/domains/${projectId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to connect domain');
        return;
      }
      setNewDomain('');
      await loadDomains();
    } catch (e: any) {
      setError(e?.message || 'Failed to connect domain');
    } finally {
      setIsConnecting(false);
    }
  };

  const deleteDomain = async (domainId: string) => {
    if (!window.confirm('Remove this domain? This will delete the DNS record from Cloudflare.')) return;
    try {
      const headers = await getAuthHeader();
      await fetch(`/api/domains/${domainId}`, { method: 'DELETE', headers });
      setDomains(prev => prev.filter(d => d.id !== domainId));
    } catch (e: any) {
      setError(e?.message || 'Failed to remove domain');
    }
  };

  if (!projectId) {
    return (
      <div className="text-center text-zinc-500 py-8 text-sm">
        Save your project to manage custom domains.
      </div>
    );
  }

  const StatusBadge = ({ status }: { status: Domain['status'] }) => {
    if (status === 'active') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
          <CheckCircle size={10} />
          Active
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full animate-pulse">
          <Clock size={10} />
          Pending DNS
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
        <AlertCircle size={10} />
        Error
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Add domain */}
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <Globe size={14} />
          Connect a custom domain
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. myapp.com or app.mycompany.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && connectDomain()}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-zinc-600"
          />
          <button
            onClick={connectDomain}
            disabled={isConnecting || !newDomain.trim()}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isConnecting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Connect
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Domain list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-zinc-500 gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading domains...
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center text-zinc-500 py-6 text-sm">
          No domains connected yet.
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain) => (
            <div key={domain.id} className="flex items-center gap-3 bg-zinc-800/50 p-3 rounded border border-zinc-700 group">
              <Globe size={14} className="text-zinc-500 shrink-0" />
              <span className="flex-1 font-mono text-sm text-zinc-200">{domain.domain}</span>
              <StatusBadge status={domain.status} />
              <button
                onClick={() => deleteDomain(domain.id)}
                className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove domain"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info box for manual DNS */}
      {deploymentUrl && (
        <div className="bg-zinc-800/30 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-300">How to point your domain (if not using Cloudflare)</p>
              <p className="text-xs text-zinc-500">Add a CNAME record pointing to your deployment:</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-xs font-mono text-blue-300 bg-zinc-900 px-2 py-1 rounded flex-1">
                  CNAME → {new URL(deploymentUrl).hostname}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(new URL(deploymentUrl).hostname)}
                  className="p-1 text-zinc-500 hover:text-white transition-colors"
                  title="Copy hostname"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
