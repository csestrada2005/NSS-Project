import { useState } from 'react';
import { Rocket, ExternalLink, Copy, RefreshCw, CheckCircle } from 'lucide-react';
import { platformService } from '../../services/PlatformService';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';
import type { TypeIssue } from '../../services/PlatformService';

interface DeployManagerProps {
  files?: Map<string, string>;
  projectId?: string | null;
}

type DeployStage = 'idle' | 'packaging' | 'uploading' | 'building' | 'live' | 'error';

const STAGE_MESSAGES: Partial<Record<DeployStage, ForgeKey>> = {
  packaging: 'deploy.stage.packaging',
  uploading: 'deploy.stage.uploading',
  building: 'deploy.stage.building',
  live: 'deploy.stage.live',
};

export function DeployManager({ files, projectId: propProjectId }: DeployManagerProps) {
  const [stage, setStage] = useState<DeployStage>('idle');
  const { t } = useForgeLang();
  const stageMessage = STAGE_MESSAGES[stage] ? t(STAGE_MESSAGES[stage]!) : '';
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [typeErrors, setTypeErrors] = useState<TypeIssue[]>([]);
  const [inspectorUrl, setInspectorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const projectId = propProjectId ?? sessionStorage.getItem('forge_project_id');

  const handleDeploy = async () => {
    if (!projectId) {
      setErrorMessage(t('deploy.noProject'));
      setStage('error');
      return;
    }

    setStage('packaging');
    setErrorMessage(null);
    setTypeErrors([]);
    setInspectorUrl(null);
    setDeploymentUrl(null);

    try {
      const filesObj = files
        ? Object.fromEntries(files)
        : {};

      setStage('uploading');
      const result = await platformService.deployProject(projectId, filesObj, `nebu-${projectId}`);

      if (result.error) {
        // Bucket 6 — la revisión previa encontró errores de tipos: no se mandó
        // a Vercel. Se explican en lenguaje llano y se listan.
        if (result.error === 'typecheck' && result.typeErrors?.length) {
          setTypeErrors(result.typeErrors);
          setErrorMessage(t('deploy.typecheckFailed'));
        } else {
          setErrorMessage(result.error);
        }
        setInspectorUrl(result.inspectorUrl ?? null);
        setStage('error');
        return;
      }

      setStage('building');

      // The deploy endpoint polls until READY, so by the time we get a response it's done
      setDeploymentUrl(result.url ?? null);
      setStage('live');
    } catch (err: any) {
      setErrorMessage(err?.message || t('deploy.failed'));
      setStage('error');
    }
  };

  const handleCopy = () => {
    if (deploymentUrl) {
      navigator.clipboard.writeText(deploymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isDeploying = stage === 'packaging' || stage === 'uploading' || stage === 'building';

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-background/50 p-4 rounded-lg border border-border border-l-4 border-l-primary">
        <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
          <Rocket className="text-primary" size={20} />
          {t('deploy.title')}
        </h3>
        <p className="text-muted-foreground text-sm mb-4">
          {t('deploy.intro')}
        </p>

        {/* Progress indicator */}
        {isDeploying && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
            <LoadingSquares size={16} />
            <span className="text-sm text-foreground">{stageMessage}</span>
          </div>
        )}

        {stage === 'live' && deploymentUrl && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-emerald-950/60 border border-emerald-800/40 rounded-lg">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-300">{t('deploy.success')}</span>
          </div>
        )}

        {stage === 'error' && errorMessage && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/40 rounded-lg text-sm text-red-300 space-y-2">
            <p>{errorMessage}</p>
            {typeErrors.length > 0 && (
              <ul className="list-disc pl-5 font-mono text-xs space-y-1">
                {typeErrors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e.file ?? '?'}{e.line ? `:${e.line}` : ''} — {e.message}</li>
                ))}
                {typeErrors.length > 8 && <li className="list-none">{t('chat.types.more', { count: typeErrors.length - 8 })}</li>}
              </ul>
            )}
            {inspectorUrl && (
              <a href={inspectorUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                <ExternalLink size={12} />
                {t('deploy.viewLog')}
              </a>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="nebu-cta px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isDeploying
              ? <LoadingSquares size={16} />
              : stage === 'error'
              ? <RefreshCw size={16} />
              : <Rocket size={16} />}
            {isDeploying ? stageMessage : stage === 'error' ? t('common.retry') : t('settings.tab.deploy')}
          </button>

          {deploymentUrl && (
            <>
              <a
                href={deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-foreground hover:text-primary text-sm font-medium bg-muted px-3 py-1 rounded border border-border transition-colors"
              >
                <ExternalLink size={14} />
                {t('deploy.openSite')}
              </a>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm bg-muted hover:bg-accent px-3 py-1 rounded border border-border transition-colors"
              >
                {copied ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? t('deploy.copied') : t('deploy.copyUrl')}
              </button>
            </>
          )}
        </div>
      </div>

      {deploymentUrl && (
        <div className="bg-background/50 rounded-lg border border-border border-l-4 border-l-primary p-3">
          <p className="text-xs text-muted-foreground mb-1">{t('deploy.url')}</p>
          <p className="text-sm font-mono text-foreground break-all">{deploymentUrl}</p>
        </div>
      )}
    </div>
  );
}
