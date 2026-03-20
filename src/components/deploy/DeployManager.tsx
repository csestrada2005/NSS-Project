import { useState } from 'react';
import { Loader2, Rocket, ExternalLink, Copy, RefreshCw, CheckCircle } from 'lucide-react';
import { platformService } from '../../services/PlatformService';

interface DeployManagerProps {
  files?: Map<string, string>;
  projectId?: string | null;
}

type DeployStage = 'idle' | 'packaging' | 'uploading' | 'building' | 'live' | 'error';

const STAGE_MESSAGES: Record<DeployStage, string> = {
  idle: '',
  packaging: 'Packaging files...',
  uploading: 'Uploading to Vercel...',
  building: 'Building...',
  live: 'Live!',
  error: '',
};

export function DeployManager({ files, projectId: propProjectId }: DeployManagerProps) {
  const [stage, setStage] = useState<DeployStage>('idle');
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const projectId = propProjectId ?? sessionStorage.getItem('forge_project_id');

  const handleDeploy = async () => {
    if (!projectId) {
      setErrorMessage('No project ID found. Save your project first.');
      setStage('error');
      return;
    }

    setStage('packaging');
    setErrorMessage(null);
    setDeploymentUrl(null);

    try {
      const filesObj = files
        ? Object.fromEntries(files)
        : {};

      setStage('uploading');
      const result = await platformService.deployProject(projectId, filesObj, `nebu-${projectId}`);

      if (result.error) {
        setErrorMessage(result.error);
        setStage('error');
        return;
      }

      setStage('building');

      // The deploy endpoint polls until READY, so by the time we get a response it's done
      setDeploymentUrl(result.url ?? null);
      setStage('live');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Deployment failed');
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
      <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Rocket className="text-purple-500" size={20} />
          Deploy to Vercel
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          One-click deployment managed by the platform. No token required.
        </p>

        {/* Progress indicator */}
        {isDeploying && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-purple-900/20 border border-purple-800/40 rounded-lg">
            <Loader2 size={16} className="animate-spin text-purple-400 shrink-0" />
            <span className="text-sm text-purple-300">{STAGE_MESSAGES[stage]}</span>
          </div>
        )}

        {stage === 'live' && deploymentUrl && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-emerald-900/20 border border-emerald-800/40 rounded-lg">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-300">Deployed successfully!</span>
          </div>
        )}

        {stage === 'error' && errorMessage && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isDeploying
              ? <Loader2 className="animate-spin" size={16} />
              : stage === 'error'
              ? <RefreshCw size={16} />
              : <Rocket size={16} />}
            {isDeploying ? STAGE_MESSAGES[stage] : stage === 'error' ? 'Retry' : 'Deploy'}
          </button>

          {deploymentUrl && (
            <>
              <a
                href={deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium bg-purple-900/20 px-3 py-1 rounded border border-purple-500/30 transition-colors"
              >
                <ExternalLink size={14} />
                Open Site
              </a>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-gray-400 hover:text-white text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded border border-gray-700 transition-colors"
              >
                {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
            </>
          )}
        </div>
      </div>

      {deploymentUrl && (
        <div className="bg-gray-900/30 rounded-lg border border-gray-800 p-3">
          <p className="text-xs text-gray-500 mb-1">Deployment URL</p>
          <p className="text-sm font-mono text-gray-300 break-all">{deploymentUrl}</p>
        </div>
      )}
    </div>
  );
}
