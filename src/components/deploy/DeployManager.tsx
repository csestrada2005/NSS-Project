import { useState, useRef, useEffect } from 'react';
import { webContainerService } from '../../services/WebContainerService';
import { Loader2, Rocket, ExternalLink, Terminal, XCircle } from 'lucide-react';

export function DeployManager() {
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setLogs([]);
    setDeploymentUrl(null);
    setShowLogs(true);

    try {
      const env = webContainerService.getEnv();
      const token = env.VERCEL_TOKEN;
      if (!token) {
        setLogs(prev => [...prev, 'Error: VERCEL_TOKEN not found in secrets. Please add it in Settings.']);
        setIsDeploying(false);
        return;
      }

      const container = webContainerService.getContainer();
      if (!container) {
          setLogs(prev => [...prev, 'Error: WebContainer not booted.']);
          setIsDeploying(false);
          return;
      }

      setLogs(prev => [...prev, 'Starting deployment...']);
      setLogs(prev => [...prev, '> npx vercel deploy --prod --yes']);

      const installProcess = await container.spawn('npx', ['vercel', 'deploy', '--prod', '--token', token, '--yes'], {
          env: { ...env }
      });

      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          setLogs(prev => [...prev, data]);
          // Try to extract URL from logs
          // e.g. https://project-name.vercel.app
          // Vercel output usually puts the URL at the end
          // Regex for https url ending with .vercel.app
          const urlMatch = data.match(/https:\/\/[a-zA-Z0-9-]+\.vercel\.app/);
          if (urlMatch) {
              setDeploymentUrl(urlMatch[0]);
          }
        }
      }));

      const exitCode = await installProcess.exit;

      if (exitCode === 0) {
          setLogs(prev => [...prev, 'Deployment successful!']);
      } else {
          setLogs(prev => [...prev, `Deployment failed with exit code ${exitCode}`]);
      }
    } catch (error: any) {
      setLogs(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <Rocket className="text-purple-500" size={20} />
            Deploy to Vercel
        </h3>
        <p className="text-gray-400 text-sm mb-4">
            Deploy your application to Vercel's edge network.
            Requires <code>VERCEL_TOKEN</code> in secrets.
        </p>

        <div className="flex items-center gap-4 flex-wrap">
            <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
                {isDeploying ? <Loader2 className="animate-spin" size={16} /> : <Rocket size={16} />}
                {isDeploying ? 'Deploying...' : 'Deploy Now'}
            </button>

            {deploymentUrl && (
                <a
                    href={deploymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium bg-purple-900/20 px-3 py-1 rounded border border-purple-500/30"
                >
                    <ExternalLink size={16} />
                    Open Deployment
                </a>
            )}
        </div>
      </div>

      {showLogs && (
        <div className="bg-black rounded-lg border border-gray-800 overflow-hidden flex flex-col h-64 mt-2">
            <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex justify-between items-center sticky top-0">
                <span className="text-xs font-mono text-gray-400 flex items-center gap-2">
                    <Terminal size={12} />
                    Deployment Logs
                </span>
                <button
                    onClick={() => setShowLogs(false)}
                    className="text-gray-500 hover:text-white text-xs flex items-center gap-1"
                >
                    <XCircle size={12} />
                    Close
                </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-gray-300 space-y-1 custom-scrollbar">
                {logs.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">{log}</div>
                ))}
                {logs.length === 0 && <span className="text-gray-600">Waiting for logs...</span>}
                <div ref={logsEndRef} />
            </div>
        </div>
      )}
    </div>
  );
}
