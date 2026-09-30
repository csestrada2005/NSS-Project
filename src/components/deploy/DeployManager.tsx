import { useRef, useState } from 'react';
import { Rocket, ExternalLink, Copy, RefreshCw, CheckCircle, Wrench } from 'lucide-react';
import { platformService } from '../../services/PlatformService';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';
import type { TypeIssue } from '../../services/PlatformService';
import { buildTypeFixPrompt } from '../chat/ResultCards';

export interface TypeFixProgress {
  step: number;
  total: number;
  summary?: string;
}

interface DeployManagerProps {
  files?: Map<string, string>;
  projectId?: string | null;
  /**
   * "Arreglar ahora" (2026-09-30, pedido de Samuel: todo desde Publicar): corre
   * el arreglo de los errores de tipos con el pipeline normal, sin salir de
   * esta pestaña. Resuelve con cuántos archivos cambió.
   */
  onFixTypeErrors?: (
    prompt: string,
    onProgress: (progress: TypeFixProgress) => void
  ) => Promise<{ success: boolean; changed: number }>;
}

type DeployStage = 'idle' | 'fixing' | 'packaging' | 'uploading' | 'building' | 'live' | 'error';

const STAGE_MESSAGES: Partial<Record<DeployStage, ForgeKey>> = {
  fixing: 'deploy.stage.fixing',
  packaging: 'deploy.stage.packaging',
  uploading: 'deploy.stage.uploading',
  building: 'deploy.stage.building',
  live: 'deploy.stage.live',
};

export function DeployManager({ files, projectId: propProjectId, onFixTypeErrors }: DeployManagerProps) {
  const [stage, setStage] = useState<DeployStage>('idle');
  const { t } = useForgeLang();
  const stageMessage = STAGE_MESSAGES[stage] ? t(STAGE_MESSAGES[stage]!) : '';
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [typeErrors, setTypeErrors] = useState<TypeIssue[]>([]);
  const [inspectorUrl, setInspectorUrl] = useState<string | null>(null);
  const [fixProgress, setFixProgress] = useState<TypeFixProgress | null>(null);
  const [copied, setCopied] = useState(false);
  // Los archivos por ref: tras "Arreglar ahora" se vuelve a publicar desde el
  // mismo handler, cuyo closure vería los archivos de ANTES del arreglo.
  const filesRef = useRef(files);
  filesRef.current = files;

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
      const current = filesRef.current;
      const filesObj = current ? Object.fromEntries(current) : {};

      setStage('uploading');
      const result = await platformService.deployProject(projectId, filesObj, `nebu-${projectId}`);

      if (result.error) {
        // El build de Vercel falló por tipos: la lista viene de su propio log.
        if (result.error === 'typecheck' && result.typeErrors?.length) {
          setTypeErrors(result.typeErrors);
          setErrorMessage(t('deploy.typecheckFailedVercel'));
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

  const handleFix = async () => {
    if (!onFixTypeErrors || typeErrors.length === 0) return;
    const prompt = buildTypeFixPrompt(typeErrors);
    setStage('fixing');
    setFixProgress(null);
    setErrorMessage(null);
    const result = await onFixTypeErrors(prompt, setFixProgress);
    setFixProgress(null);
    if (!result.success || result.changed === 0) {
      // No se toca nada más: la lista sigue a la vista y se puede reintentar.
      setErrorMessage(t('deploy.fixFailed'));
      setStage('error');
      return;
    }
    // Un turno del bucle de eventos para que el editor entregue los archivos
    // recién escritos (filesRef) antes de volver a publicar.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handleDeploy();
  };

  const handleCopy = () => {
    if (deploymentUrl) {
      navigator.clipboard.writeText(deploymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isBusy = stage === 'fixing' || stage === 'packaging' || stage === 'uploading' || stage === 'building';

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
        {isBusy && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
            <LoadingSquares size={16} />
            <span className="text-sm text-foreground">
              {stageMessage}
              {stage === 'fixing' && fixProgress && (
                <span className="text-muted-foreground">
                  {' '}{t('deploy.fixStep', { step: fixProgress.step, total: fixProgress.total })}
                  {fixProgress.summary ? ` — ${fixProgress.summary}` : ''}
                </span>
              )}
            </span>
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
            {typeErrors.length > 0 && onFixTypeErrors && (
              <button
                type="button"
                onClick={handleFix}
                className="nebu-cta inline-flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded text-xs font-medium"
              >
                <Wrench size={12} />
                {t('chat.types.fix')}
              </button>
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
            disabled={isBusy}
            className="nebu-cta px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isBusy
              ? <LoadingSquares size={16} />
              : stage === 'error'
              ? <RefreshCw size={16} />
              : <Rocket size={16} />}
            {isBusy ? stageMessage : stage === 'error' ? t('common.retry') : t('settings.tab.deploy')}
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
