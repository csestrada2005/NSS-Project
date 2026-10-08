import { useState } from 'react';
import { X, Lock, Github, Rocket, Database, Globe, Mail, BarChart3, ShieldCheck } from 'lucide-react';
import { DeployManager } from '../deploy/DeployManager';
import { gitHubService } from '../../services/GitHubService';
import type { FileSystemTree } from '@webcontainer/api';
import { SchemaViewer } from './db/SchemaViewer';
import { SQLEditor } from './db/SQLEditor';
import { SecretsPanel } from './db/SecretsPanel';
import { DatabaseOverview } from './db/DatabaseOverview';
import { EdgeFunctionsPanel } from './db/EdgeFunctionsPanel';
import { LogsViewer } from './db/LogsViewer';
import { UsagePanel } from './db/UsagePanel';
import { TrafficCharts } from './analytics/TrafficCharts';
import { LighthousePanel } from './analytics/LighthousePanel';
import { TopPagesTable } from './analytics/TopPagesTable';
import { DomainsPanel } from './DomainsPanel';
import { EmailPanel } from './EmailPanel';
import { SecurityPanel } from './SecurityPanel';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { t as tNow } from '@/i18n/forge/lang';
import type { ForgeKey } from '@/i18n/forge/en';
import { firstBusy, useBusy } from '@/utils/busyRegistry';
import { wyrdToast } from '@/utils/wyrdToast';

interface SettingsModalProps {
  onClose: () => void;
  fileTree: FileSystemTree;
  files?: Map<string, string>;
  projectId?: string | null;
  /** Con qué pestaña abrir — el botón "Publicar" del navbar la abre directo en 'deploy'. */
  initialTab?: MainTab;
  /** "Arreglar ahora" en Publicar: corre el arreglo sin salir de la pestaña. */
  onFixTypeErrors?: React.ComponentProps<typeof DeployManager>['onFixTypeErrors'];
  /** "Arreglar" de Seguridad (S2): mismo mecanismo que "Arreglar ahora". */
  onFixSecurity?: React.ComponentProps<typeof SecurityPanel>['onFix'];
  /** La migración pendiente del chat, para aplicarla desde Seguridad. */
  securityDdl?: React.ComponentProps<typeof SecurityPanel>['ddl'];
}

export type MainTab = 'secrets' | 'github' | 'deploy' | 'security' | 'domains' | 'database' | 'email' | 'analytics';
type DbSubTab = 'overview' | 'schema' | 'sql' | 'secrets' | 'edge-functions' | 'logs' | 'usage';

// Panel Cloud (bucket 5, ítem 1): overview/edge-functions/logs/usage/users
// existían como componentes hechos pero nunca montados aquí. edge-functions/
// logs/usage estaban además rotos (exponían SUPABASE_SERVICE_ROLE_KEY al
// navegador) — arreglado en server/projectManagementApi.js antes de montarlos.
const DB_SUB_TABS: { id: DbSubTab; label: ForgeKey }[] = [
  { id: 'overview', label: 'hub.tab.overview' },
  { id: 'schema', label: 'hub.db.schema' },
  { id: 'sql', label: 'hub.db.sql' },
  { id: 'secrets', label: 'settings.tab.secrets' },
  { id: 'edge-functions', label: 'settings.db.edgeFunctions' },
  { id: 'logs', label: 'settings.db.logs' },
  { id: 'usage', label: 'settings.db.usage' },
];

export function SettingsModal({ onClose, fileTree, files, projectId: propProjectId, initialTab = 'secrets', onFixTypeErrors, onFixSecurity, securityDdl }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const { t } = useForgeLang();
  const [dbSubTab, setDbSubTab] = useState<DbSubTab>('schema');

  const projectId = propProjectId ?? sessionStorage.getItem('forge_project_id');

  // Analytics date range state
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { start, end };
  });

  const setQuickRange = (days: number) => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setDateRange({ start, end });
  };

  // GitHub State
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState(() => tNow('settings.github.defaultCommit'));
  const [isPushing, setIsPushing] = useState(false);
  useBusy('github', isPushing);
  const [pushStatus, setPushStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleGitHubPush = async () => {
    setIsPushing(true);
    setPushStatus(null);
    try {
      const url = await gitHubService.pushToRepo(repoName, branch, fileTree, commitMessage);
      setPushStatus({ success: true, message: t('settings.github.pushed', { url }) });
    } catch (error: any) {
      setPushStatus({ success: false, message: error.message });
    } finally {
      setIsPushing(false);
    }
  };

  // Cambiar de pestaña cierra la anterior: con algo a medias (publicando,
  // revisando seguridad…) se avisa en vez de cortarlo (2026-10-08, Samuel).
  const guardedSwitch = (change: () => void) => {
    const busy = firstBusy();
    if (busy) {
      wyrdToast.message(t(`studio.busy.${busy}`));
      return;
    }
    change();
  };

  const TAB_BUTTON = (id: MainTab, label: string, Icon: React.ComponentType<any>) => (
    <button
      onClick={() => { if (id !== activeTab) guardedSwitch(() => setActiveTab(id)); }}
      className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === id ? 'bg-accent text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  // In-place dentro del área del preview (StudioEngine, navbar nuevo del
  // 2026-09-20) — antes era un modal centrado flotante (fixed inset-0 +
  // backdrop); ahora reemplaza al preview igual que CodePanel, sin backdrop
  // ni animación de entrada/salida (mismo trato instantáneo que Code).
  // SettingsModal sólo se usa desde StudioEngine.tsx — no hay otro caller que
  // dependa del modo flotante.
  return (
    <div className="nebu-modal bg-card w-full h-full p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">{t('hub.tab.settings')}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label={t('common.close')}>
          <X size={20} />
        </button>
      </div>

        {/* Main tabs */}
        <div className="flex gap-1 mb-6 border-b border-border pb-1 overflow-x-auto">
          {TAB_BUTTON('secrets', t('settings.tab.secrets'), Lock)}
          {TAB_BUTTON('github', 'GitHub', Github)}
          {TAB_BUTTON('deploy', t('settings.tab.deploy'), Rocket)}
          {TAB_BUTTON('security', t('settings.tab.security'), ShieldCheck)}
          {TAB_BUTTON('domains', t('hub.tab.domains'), Globe)}
          {TAB_BUTTON('database', t('hub.tab.database'), Database)}
          {TAB_BUTTON('email', t('hub.tab.email'), Mail)}
          {TAB_BUTTON('analytics', t('hub.tab.analytics'), BarChart3)}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
          {/* Secrets tab */}
          {activeTab === 'secrets' && (
            <SecretsPanel projectId={projectId} />
          )}

          {/* GitHub tab */}
          {activeTab === 'github' && (
            <div className="space-y-6">
              <div className="bg-background/50 rounded-lg p-4 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Github className="text-foreground" size={20} />
                  {t('settings.github.title')}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('settings.github.intro')} {t('settings.github.requires')} <code>GITHUB_TOKEN</code>.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.github.repo')}</label>
                    <input type="text" placeholder={t('settings.github.repoPlaceholder')} value={repoName} onChange={(e) => setRepoName(e.target.value)}
                      className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.github.branch')}</label>
                    <input type="text" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.github.commit')}</label>
                    <input type="text" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)}
                      className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </div>
                  <button onClick={handleGitHubPush} disabled={isPushing || !repoName || !branch}
                    className="nebu-cta w-full py-2 bg-secondary hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-border">
                    {isPushing ? <LoadingSquares size={16} /> : <Github size={16} />}
                    {isPushing ? t('settings.github.pushing') : t('settings.github.push')}
                  </button>
                  {pushStatus && (
                    <div className={`p-3 rounded border text-sm ${pushStatus.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                      {pushStatus.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Deploy tab */}
          {activeTab === 'deploy' && (
            <DeployManager
              files={files}
              projectId={projectId}
              onFixTypeErrors={onFixTypeErrors}
              onOpenSecurity={() => setActiveTab('security')}
            />
          )}

          {/* Security tab — agente de seguridad (S1) */}
          {activeTab === 'security' && (
            <SecurityPanel projectId={projectId} files={files} onFix={onFixSecurity} ddl={securityDdl} />
          )}

          {/* Domains tab */}
          {activeTab === 'domains' && (
            <DomainsPanel projectId={projectId} />
          )}

          {/* Email tab */}
          {activeTab === 'email' && (
            <EmailPanel projectId={projectId} />
          )}

          {/* Analytics tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">{t('settings.analytics.from')}</label>
                  <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-muted border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">{t('settings.analytics.to')}</label>
                  <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-muted border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="flex gap-1">
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => setQuickRange(d)}
                      className="px-2 py-1 text-xs bg-muted hover:bg-accent border border-border text-muted-foreground rounded transition-colors">
                      {t('settings.analytics.days', { count: d })}
                    </button>
                  ))}
                </div>
              </div>
              <TrafficCharts projectId={projectId} dateRange={dateRange} />
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('settings.analytics.audit')}</h3>
                  <LighthousePanel projectId={projectId} />
                </div>
                <div className="lg:col-span-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('settings.analytics.topPages')}</h3>
                  <TopPagesTable projectId={projectId} dateRange={dateRange} />
                </div>
              </div>
            </div>
          )}

          {/* Database tab */}
          {activeTab === 'database' && (
            <div>
              {/* Sub-tab bar */}
              <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto pb-px">
                {DB_SUB_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { if (tab.id !== dbSubTab) guardedSwitch(() => setDbSubTab(tab.id)); }}
                    className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${dbSubTab === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    {t(tab.label)}
                  </button>
                ))}
              </div>

              <div>
                {dbSubTab === 'overview' && <DatabaseOverview projectId={projectId} />}
                {dbSubTab === 'schema' && <SchemaViewer projectId={projectId} />}
                {dbSubTab === 'sql' && <SQLEditor projectId={projectId} />}
                {dbSubTab === 'secrets' && <SecretsPanel projectId={projectId} />}
                {dbSubTab === 'edge-functions' && <EdgeFunctionsPanel projectId={projectId} files={files} />}
                {dbSubTab === 'logs' && <LogsViewer projectId={projectId} />}
                {dbSubTab === 'usage' && <UsagePanel projectId={projectId} />}
              </div>
            </div>
          )}
        </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
        <button onClick={onClose} className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
