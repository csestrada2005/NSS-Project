import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SupabaseService } from '../services/SupabaseService';
import { compile } from '../services/BrowserCompiler';

export function PublicPreviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [compiledHtml, setCompiledHtml] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setNotFound(true);
      return;
    }

    const load = async () => {
      const supabase = SupabaseService.getInstance().client;

      // Check that the project is public
      const { data: project } = await supabase
        .from('forge_projects')
        .select('id, is_public')
        .eq('id', projectId)
        .single();

      if (!project || !project.is_public) {
        setNotFound(true);
        return;
      }

      // Fetch all files for the project
      const { data: filesData, error } = await supabase
        .from('forge_files')
        .select('path, content')
        .eq('project_id', projectId);

      if (error || !filesData || filesData.length === 0) {
        setNotFound(true);
        return;
      }

      const filesMap = new Map<string, string>();
      for (const row of filesData) {
        filesMap.set(row.path, row.content ?? '');
      }

      const html = await compile(filesMap);
      setCompiledHtml(html);
    };

    load().catch(() => setNotFound(true));
  }, [projectId]);

  if (notFound) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">404 — Not Found</h1>
          <p className="text-gray-400">This project doesn't exist or isn't public.</p>
        </div>
      </div>
    );
  }

  if (compiledHtml === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center text-gray-400 text-sm">Loading preview...</div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen">
      <iframe
        srcDoc={compiledHtml}
        sandbox="allow-scripts allow-modals"
        className="w-full h-full border-none"
        title="Public Preview"
      />
      <div className="fixed bottom-4 right-4 z-50 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur">
        Built with Wyrd Forge
      </div>
    </div>
  );
}
