import { useState, useEffect, useRef } from 'react';
import { Globe, Plus, Trash2, CheckCircle, Clock, AlertCircle, Info, Copy } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import NebuLoader from '../brand/NebuLoader';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

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
  const { t } = useForgeLang();
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
      setError(e?.message || t('domains.loadFailed'));
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
        setError(data.error || t('domains.connectFailed'));
        return;
      }
      setNewDomain('');
      await loadDomains();
    } catch (e: any) {
      setError(e?.message || t('domains.connectFailed'));
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
      setError(e?.message || t('domains.removeFailed'));
    }
  };

  if (!projectId) {
    return (
      <div className="text-center text-neutral-500 py-8 text-sm">
        {t('domains.needProject')}
      </div>
    );
  }

  const StatusBadge = ({ status }: { status: Domain['status'] }) => {
    if (status === 'active') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
          <CheckCircle size={10} />
          {t('domains.status.active')}
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full animate-pulse">
          <Clock size={10} />
          {t('domains.status.pending')}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
        <AlertCircle size={10} />
        {t('domains.status.error')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Add domain */}
      <div className="bg-background/50 rounded-lg p-4 border border-border border-l-4 border-l-primary">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Globe size={14} />
          {t('domains.title')}
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t('domains.placeholder')}
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && connectDomain()}
            className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <button
            onClick={connectDomain}
            disabled={isConnecting || !newDomain.trim()}
            className="nebu-cta px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isConnecting ? <LoadingSquares size={14} /> : <Plus size={14} />}
            {t('domains.connect')}
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
        <div className="flex flex-col items-center justify-center py-8 text-neutral-500 gap-3 text-sm">
          <NebuLoader size={96} />
          {t('domains.loading')}
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center text-neutral-500 py-6 text-sm">
          {t('domains.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain) => (
            <div key={domain.id} className="flex items-center gap-3 bg-neutral-800/50 p-3 rounded border border-neutral-700 group">
              <Globe size={14} className="text-neutral-500 shrink-0" />
              <span className="flex-1 font-mono text-sm text-neutral-200">{domain.domain}</span>
              <StatusBadge status={domain.status} />
              <button
                onClick={() => deleteDomain(domain.id)}
                className="p-1.5 text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title={t('domains.remove')}
                aria-label={t('domains.remove')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info box for manual DNS */}
      {deploymentUrl && (
        <div className="bg-background/50 border border-border border-l-4 border-l-primary rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{t('domains.howTo')}</p>
              <p className="text-xs text-muted-foreground">{t('domains.cname')}</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded flex-1">
                  CNAME → {new URL(deploymentUrl).hostname}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(new URL(deploymentUrl).hostname)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title={t('domains.copyHost')}
                  aria-label={t('domains.copyHost')}
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
