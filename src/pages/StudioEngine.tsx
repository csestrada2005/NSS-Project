/**
 * StudioEngine — Wyrd Forge AI web-builder IDE (Phase 2/3/4 refactor).
 *
 * Changes from original:
 * - WebContainer removed; replaced with BrowserCompiler → srcdoc iframe
 * - Files stored in Supabase forge_files table, managed via useProjectFiles hook
 * - Project ID comes from URL params (/studio/:projectId) — no sessionStorage
 * - isReadOnly mode when user doesn't own the project
 * - Phase 4 fixes: stale data-oid clear, initial prompt race condition guard
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Panel, Group } from 'react-resizable-panels';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useProjectFiles } from '../hooks/useProjectFiles';
import '../App.css';
import { ChatInterface } from '../components/ChatInterface';
import { Terminal, type TerminalRef } from '../components/Terminal';
import { PreviewOverlay } from '../components/PreviewOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { FileExplorer } from '../components/FileExplorer';
import { AIOrchestrator } from '../services/AIOrchestrator';
import { SupabaseService } from '../services/SupabaseService';
import { compile } from '../services/BrowserCompiler';
import { updateCode, updateJSXProp, type TargetElement } from '../utils/ast';
import { fileSystemTreeToMap, mapToFileSystemTree } from '../utils/context';
import JSZip from 'jszip';
import {
  Download,
  Upload,
  Loader2,
  Settings,
  Activity,
  Menu,
  Code,
  Eye,
  Share2,
  ChevronLeft,
} from 'lucide-react';
import { TEMPLATES } from '../templates';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { SettingsModal } from '../components/settings/SettingsModal';
import { StateGraph } from '../components/debug/StateGraph';
import { CommandBubble } from '../components/CommandBubble';
import { CommandModal } from '../components/CommandModal';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { ProjectMemoryService } from '../services/ProjectMemoryService';
import CreditBalance from '../components/forge/CreditBalance';
import { ShareProjectModal } from '../components/forge/ShareProjectModal';

type TabType = 'chat' | 'visual' | 'code';


// Active file for AST updates (Inspector) — single-page apps live here
const ACTIVE_FILE_PATH = 'src/App.tsx';

export function StudioEngine() {
  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Initial prompt from ForgeDashboard navigate state (Phase 4 Fix 4)
  const initialPrompt = (location.state as any)?.initialPrompt as string | undefined;
  const hasProcessedInitialPrompt = useRef(false);
  const isAutoLoadingTemplate = useRef(false);

  // -------------------------------------------------------------------------
  // File state (replaces WebContainer + FileSystemTree)
  // -------------------------------------------------------------------------
  const { files, isLoading, loadFromSupabase, saveFile, updateLocalFile, flushPendingWrites } = useProjectFiles();

  // -------------------------------------------------------------------------
  // Preview state
  // -------------------------------------------------------------------------
  const [compiledHtml, setCompiledHtml] = useState('');
  const [hasValidPreview, setHasValidPreview] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const memoryInitialized = useRef<boolean>(false);

  // -------------------------------------------------------------------------
  // UI state
  // -------------------------------------------------------------------------
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showHamburger, setShowHamburger] = useState(false);
  const [selectedElement, setSelectedElement] = useState<TargetElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState<'interaction' | 'visual'>('interaction');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [activeBottomTab, setActiveBottomTab] = useState<TabType>('chat');
  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Phase 4 Fix 2: track whether last file change came from AI
  const lastChangeSource = useRef<'ai' | 'user'>('user');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<TerminalRef>(null);

  const [isPublic, setIsPublic] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState<string>('');

  // -------------------------------------------------------------------------
  // Mount: load project files from Supabase
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!projectId) {
      navigate('/forge', { replace: true });
      return;
    }

    const init = async () => {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      // Check project ownership / access
      const { data: project } = await supabase
        .from('forge_projects')
        .select('id, user_id, name')
        .eq('id', projectId)
        .single();

      if (project?.name) setCurrentProjectName(project.name);

      if (!project) {
        // Check public access
        const { data: access } = await supabase
          .from('forge_project_access')
          .select('is_public')
          .eq('project_id', projectId)
          .single();

        if (!access?.is_public) {
          navigate('/forge', { replace: true });
          return;
        }
        setIsReadOnly(true);
      } else if (project.user_id !== user.id) {
        // Another user's project — check collaborator access first
        const { data: collab } = await supabase
          .from('forge_project_collaborators')
          .select('role, status')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .eq('status', 'accepted')
          .single();

        if (collab) {
          // Collaborator — read-only if 'read' role, can edit if 'edit' role
          setIsReadOnly(collab.role === 'read');
        } else {
          // Not a collaborator — check if project is public
          const { data: access } = await supabase
            .from('forge_project_access')
            .select('is_public')
            .eq('project_id', projectId)
            .single();

          if (!access?.is_public) {
            navigate('/forge', { replace: true });
            return;
          }
          setIsReadOnly(true);
        }
      }

      await loadFromSupabase(projectId);

      // Fetch is_public status after files are loaded
      const { data: projectRow } = await supabase
        .from('forge_projects')
        .select('is_public')
        .eq('id', projectId)
        .single();
      if (projectRow?.is_public) setIsPublic(true);
    };

    init().catch(console.error);
  }, [projectId]);

  // -------------------------------------------------------------------------
  // AI callback registration
  // -------------------------------------------------------------------------
  useEffect(() => {
    AIOrchestrator.setFileUpdateCallback((path, content) => {
      lastChangeSource.current = 'ai';
      updateLocalFile(path, content);
      // Async save — don't await to keep the callback synchronous
      saveFile(path, content).catch(console.error);
    });
  }, [updateLocalFile, saveFile]);

  // -------------------------------------------------------------------------
  // Debounced compilation whenever files change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (files.size === 0) return;

    const timer = setTimeout(async () => {
      setIsCompiling(true);
      try {
        const html = await compile(files);
        setCompiledHtml(html);
        if (!html.includes('Compilation Error')) {
          setHasValidPreview(true);
          setShowTemplateSelector(false);
        }
      } catch (e: any) {
        console.error('[StudioEngine] Compile error:', e);
      } finally {
        setIsCompiling(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [files]);

  // -------------------------------------------------------------------------
  // Memory initialization overlay
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isLoading && files.size > 0 && projectId && !memoryInitialized.current) {
      memoryInitialized.current = true;
      ProjectMemoryService.get(projectId).then(memory => {
        if (!memory) {
          setIsIndexing(true);
          ProjectMemoryService.buildFromFiles(projectId, files).finally(() => {
            setIsIndexing(false);
          });
        }
      });
    }
  }, [isLoading, files.size, projectId]);

  // -------------------------------------------------------------------------
  // Memory refresh listener
  // -------------------------------------------------------------------------
  const memoryRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { path, projectId: pid } = (e as CustomEvent).detail;
      if (pid !== projectId) return;
      if (memoryRefreshTimer.current) clearTimeout(memoryRefreshTimer.current);
      memoryRefreshTimer.current = setTimeout(() => {
        ProjectMemoryService.updateAfterChange(projectId!, [path], files);
      }, 5000);
    };
    window.addEventListener('forge:file-saved', handler);
    return () => {
      window.removeEventListener('forge:file-saved', handler);
      if (memoryRefreshTimer.current) clearTimeout(memoryRefreshTimer.current);
    };
  }, [projectId, files]);

  // -------------------------------------------------------------------------
  // Phase 4 Fix 4: run initialPrompt only after files have loaded
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isLoading) return;
    if (!initialPrompt) return;
    if (hasProcessedInitialPrompt.current) return;
    if (isAutoLoadingTemplate.current) return;

    if (files.size > 0) {
      hasProcessedInitialPrompt.current = true;
      handleSendMessage(initialPrompt);
    } else {
      isAutoLoadingTemplate.current = true;
      hasProcessedInitialPrompt.current = true;
      handleLoadTemplate('landing-page').then(() => {
        handleSendMessage(initialPrompt);
      });
    }
  }, [isLoading]);

  // -------------------------------------------------------------------------
  // Auto-load template silently when files are empty (Prompt 4)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isLoading) return;
    if (files.size > 0) return;
    if (hasProcessedInitialPrompt.current) return;
    handleLoadTemplate('landing-page');
  }, [isLoading, files.size]);

  // -------------------------------------------------------------------------
  // Phase 4 Fix 2: clear stale element selection after AI modifies App.tsx
  // -------------------------------------------------------------------------
  const prevAppContent = useRef<string | null>(null);
  useEffect(() => {
    const appContent = files.get(ACTIVE_FILE_PATH) ?? null;
    if (
      appContent !== null &&
      appContent !== prevAppContent.current &&
      lastChangeSource.current === 'ai'
    ) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'clear-selection' }, '*');
      setSelectedElement(null);
    }
    prevAppContent.current = appContent;
  }, [files]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts (Ctrl+Z / Ctrl+Y handled by browser native undo in textarea)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (_e: KeyboardEvent) => {
      // Future: wire undo/redo to file history here
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // -------------------------------------------------------------------------
  // Snapshot save to forge_snapshots (for HistoryDrawer)
  // -------------------------------------------------------------------------
  const saveSnapshot = useCallback(async (trigger: string, label?: string) => {
    if (!projectId) return;
    if (files.size === 0) return;
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Flush all pending debounced writes before capturing the snapshot
      await flushPendingWrites();

      const fileTree = mapToFileSystemTree(files);

      try {
        await supabase.from('forge_snapshots').insert({
          project_id: projectId,
          user_id: user.id,
          label: label ?? null,
          file_tree: fileTree,
          trigger,
        });
        await supabase
          .from('forge_projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', projectId);
      } catch (e) {
        console.error('[saveSnapshot] Failed:', e);
      }
    } catch (e) {
      console.error('[saveSnapshot] Error:', e);
    }
  }, [projectId, files, flushPendingWrites]);

  // -------------------------------------------------------------------------
  // Template loader
  // -------------------------------------------------------------------------
  const handleLoadTemplate = async (templateKey: string) => {
    const template = TEMPLATES[templateKey];
    if (!template) return;

    setShowTemplateSelector(false);
    const flatFiles = fileSystemTreeToMap(template);

    for (const [path, content] of flatFiles) {
      updateLocalFile(path, content);
      await saveFile(path, content);
    }

    await saveSnapshot('template_load');
  };

  // -------------------------------------------------------------------------
  // Code editor handlers
  // -------------------------------------------------------------------------
  const handleFileSelect = (path: string) => {
    setSelectedFilePath(path);
    setSelectedFileContent(files.get(path) || '');
  };

  const handleCodeEdit = (newContent: string) => {
    setSelectedFileContent(newContent);
  };

  const saveAndRun = async () => {
    if (!selectedFilePath) return;
    lastChangeSource.current = 'user';
    updateLocalFile(selectedFilePath, selectedFileContent);
    await saveFile(selectedFilePath, selectedFileContent);
  };

  // -------------------------------------------------------------------------
  // Visual editing handlers
  // -------------------------------------------------------------------------
  const handleElementSelect = (element: TargetElement) => {
    setSelectedElement(element);
  };

  const handleTextUpdate = async (newText: string) => {
    if (!selectedElement) return;
    const code = files.get(ACTIVE_FILE_PATH);
    if (!code) return;

    lastChangeSource.current = 'user';
    const newCode = updateCode(code, selectedElement, { textContent: newText }, undefined, (msg) => {
      toast.error(msg);
    });
    updateLocalFile(ACTIVE_FILE_PATH, newCode);
    await saveFile(ACTIVE_FILE_PATH, newCode);
  };

  const handleClassUpdate = async (newClassName: string) => {
    if (!selectedElement) return;
    const code = files.get(ACTIVE_FILE_PATH);
    if (!code) return;

    lastChangeSource.current = 'user';
    const newCode = updateCode(code, selectedElement, { className: newClassName }, { classNameMode: 'replace' }, (msg) => {
      toast.error(msg);
    });
    updateLocalFile(ACTIVE_FILE_PATH, newCode);
    await saveFile(ACTIVE_FILE_PATH, newCode);

    setSelectedElement(prev => prev ? { ...prev, className: newClassName } : null);
  };

  const handlePropUpdate = async (name: string, value: string | boolean | number) => {
    if (!selectedElement) return;
    const code = files.get(ACTIVE_FILE_PATH);
    if (!code) return;

    lastChangeSource.current = 'user';
    const newCode = updateJSXProp(code, selectedElement, name, value);
    updateLocalFile(ACTIVE_FILE_PATH, newCode);
    await saveFile(ACTIVE_FILE_PATH, newCode);
  };

  const handleStyleUpdate = async (newStyles: Record<string, string>) => {
    if (!selectedElement) return;
    let currentClass = selectedElement.className || '';
    const newClassSegment = Object.values(newStyles).join(' ');

    if (newStyles.transform) {
      currentClass = currentClass.replace(/\btranslate-[xy]-[^\s]+\s?/g, '');
    }
    if (newStyles.dimensions) {
      currentClass = currentClass.replace(/\bw-[^\s]+\s?/g, '').replace(/\bh-[^\s]+\s?/g, '');
    }

    const finalClass = `${currentClass} ${newClassSegment}`.trim();
    await handleClassUpdate(finalClass);
  };

  // -------------------------------------------------------------------------
  // AI chat handler
  // -------------------------------------------------------------------------
  const handleSendMessage = async (
    message: string,
    onProgress?: (step: number, total: number, file: string) => void,
    onRetry?: (attempt: number, error: string) => void
  ): Promise<{ success: boolean; modifiedFiles: string[]; error?: string; warning?: string }> => {
    if (isReadOnly) return { success: false, modifiedFiles: [] };
    setIsGenerating(true);

    terminalRef.current?.clear();
    terminalRef.current?.write('\r\n\x1b[33m⚡ Starting build...\x1b[0m\r\n');

    try {
      lastChangeSource.current = 'ai';
      const result = await AIOrchestrator.parseUserCommand(
        message,
        files,
        selectedElement,
        projectId,
        (step, total, file) => {
          terminalRef.current?.write(
            `\r\n\x1b[32m  [${step}/${total}] Writing ${file}\x1b[0m`
          );
          onProgress?.(step, total, file);
        },
        (attempt, errorMsg) => {
          terminalRef.current?.write(
            `\r\n\x1b[31m  ⚠ Compile error — auto-fixing (attempt ${attempt}/3)\x1b[0m`
          );
          terminalRef.current?.write(
            `\r\n\x1b[90m  ${errorMsg.slice(0, 200)}\x1b[0m`
          );
          onRetry?.(attempt, errorMsg);
        }
      );
      if (result.modifiedFiles.length > 0) {
        await saveSnapshot('ai_action');
      }

      const success = result.outcome !== 'failed';
      if (success) {
        terminalRef.current?.write(
          `\r\n\x1b[32m✅ Done — ${result.modifiedFiles.length} file(s) updated.\x1b[0m\r\n`
        );
      } else {
        terminalRef.current?.write(
          '\r\n\x1b[31m❌ Build failed after 3 retries.\x1b[0m\r\n'
        );
      }

      return {
        success,
        modifiedFiles: result.modifiedFiles,
        error: result.error,
        warning: result.warning,
      };
    } catch (error) {
      console.error('[StudioEngine] Error processing message:', error);
      terminalRef.current?.write('\r\n\x1b[31m❌ Unexpected error.\x1b[0m\r\n');
      return { success: false, modifiedFiles: [] };
    } finally {
      setIsGenerating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Download project as ZIP
  // -------------------------------------------------------------------------
  const downloadProject = async () => {
    await flushPendingWrites();
    const zip = new JSZip();
    for (const [path, content] of files) {
      zip.file(path, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  };

  // Upload ZIP — show coming-soon toast
  const handleUploadZip = () => {
    alert('ZIP upload coming soon. Use the AI chat to describe your project instead!');
  };

  // Toggle public share access
  const togglePublicAccess = async () => {
    if (!projectId) return;
    const supabase = SupabaseService.getInstance().client;
    const newValue = !isPublic;
    await supabase
      .from('forge_projects')
      .update({ is_public: newValue })
      .eq('id', projectId);
    setIsPublic(newValue);
    if (newValue) {
      const url = `${window.location.origin}/preview/${projectId}`;
      await navigator.clipboard.writeText(url);
      toast.success('Preview link copied to clipboard');
    }
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const fileTree = mapToFileSystemTree(files); // for legacy components (InspectorPanel, StateGraph, SettingsModal, HistoryDrawer)
  const hasPreview = hasValidPreview;

  // -------------------------------------------------------------------------
  // Code panel (rendered inside CommandModal)
  // -------------------------------------------------------------------------
  const CodePanel = () => (
    <div className="flex w-full h-full bg-background">
      <div className="w-56 border-r border-border h-full overflow-hidden shrink-0">
        <FileExplorer
          files={files}
          onSelect={handleFileSelect}
        />
      </div>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
          <span className="text-sm text-muted-foreground truncate">{selectedFilePath || 'No file selected'}</span>
          <button
            onClick={saveAndRun}
            disabled={!selectedFilePath}
            className="px-3 py-1 bg-primary hover:bg-primary/90 text-white text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save & Run
          </button>
        </div>
        <textarea
          value={selectedFileContent}
          onChange={(e) => handleCodeEdit(e.target.value)}
          className="flex-1 w-full bg-background text-foreground p-4 font-mono text-sm resize-none focus:outline-none"
          spellCheck={false}
          disabled={!selectedFilePath}
        />
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
        <Group orientation="vertical">
          <Panel defaultSize={100} minSize={30}>
            <div className="relative w-full h-full bg-background">

              {/* Hamburger menu — top left */}
              <div className="absolute top-4 left-4 z-50">
                <button
                  onClick={() => setShowHamburger(v => !v)}
                  className="p-2 bg-background/90 hover:bg-accent border border-border rounded-lg shadow-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Menu"
                >
                  <Menu size={18} />
                </button>

                {showHamburger && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowHamburger(false)}
                    />
                    <div className="absolute top-10 left-0 z-50 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden py-1">
                      {/* Back to Nebu */}
                      <button
                        onClick={() => { setShowHamburger(false); navigate('/'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-lg"
                      >
                        <ChevronLeft size={15} className="text-muted-foreground" />
                        Back to Nebu
                      </button>

                      <div className="my-1 h-px bg-border" />

                      {/* Upload Zip — coming soon */}
                      <button
                        onClick={() => { setShowHamburger(false); handleUploadZip(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Upload size={15} className="text-muted-foreground" />
                        Upload Zip
                      </button>

                      {/* Export Zip */}
                      <button
                        onClick={() => { setShowHamburger(false); downloadProject(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Download size={15} className="text-muted-foreground" />
                        Export Zip
                      </button>

                      {/* Visual Graph */}
                      <button
                        onClick={() => { setShowHamburger(false); setShowGraph(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Activity size={15} className="text-muted-foreground" />
                        Visual Graph
                      </button>

                      <div className="my-1 h-px bg-border" />

                      {/* Share (public link toggle) */}
                      <button
                        onClick={() => { setShowHamburger(false); togglePublicAccess(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Share2 size={15} className="text-muted-foreground" />
                        {isPublic ? 'Unshare' : 'Share'}
                      </button>

                      {/* Share with collaborators */}
                      <button
                        onClick={() => { setShowHamburger(false); setShowShareModal(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Share2 size={15} className="text-muted-foreground" />
                        Invite Collaborators
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Read-only badge */}
              {isReadOnly && (
                <div className="absolute top-4 right-4 z-50 flex items-center gap-1.5 bg-yellow-900/80 border border-yellow-700 text-yellow-300 text-xs px-3 py-1.5 rounded-full">
                  <Eye size={12} />
                  View only
                </div>
              )}

              {/* Credit balance — only for owners */}
              {!isReadOnly && (
                <div className="absolute top-14 right-4 z-40">
                  <CreditBalance />
                </div>
              )}

              {/* Main content area */}
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                  <Loader2 className="animate-spin w-8 h-8" />
                  <div>Loading project...</div>
                </div>
              ) : hasPreview ? (
                <div className="relative w-full h-full">
                  {/* Edit mode toolbar */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-lg flex overflow-hidden shadow-lg">
                    <button
                      onClick={() => setEditMode('interaction')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${editMode === 'interaction' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Interaction
                    </button>
                    <button
                      onClick={() => setEditMode('visual')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${editMode === 'visual' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Visual
                    </button>
                    <button
                      onClick={() => { setActiveBottomTab('code'); setIsCommandModalOpen(true); }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${activeBottomTab === 'code' && isCommandModalOpen ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Code size={12} />
                      Code
                    </button>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 border-l border-border ml-1 pl-3"
                    >
                      <Settings size={12} />
                      Settings
                    </button>
                  </div>

                  {/* Compiling indicator */}
                  {isCompiling && (
                    <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 bg-card/90 border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">
                      <Loader2 size={12} className="animate-spin" />
                      Compiling…
                    </div>
                  )}

                  {isIndexing && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="animate-spin text-red-500" size={28} />
                      <p className="text-sm text-gray-400 font-mono">Analyzing project structure...</p>
                    </div>
                  )}

                  <iframe
                    ref={iframeRef}
                    srcDoc={compiledHtml}
                    sandbox="allow-scripts allow-modals"
                    className="w-full h-full border-none"
                    title="Preview"
                  />

                  <PreviewOverlay
                    iframeRef={iframeRef}
                    onElementSelect={handleElementSelect}
                    editMode={editMode}
                    onUpdateStyle={handleStyleUpdate}
                    onUpdateText={handleTextUpdate}
                  />

                  {editMode === 'visual' && selectedElement && (
                    <InspectorPanel
                      selectedElement={selectedElement}
                      onUpdateStyle={handleClassUpdate}
                      onUpdateProp={handlePropUpdate}
                      fileTree={fileTree}
                    />
                  )}
                </div>
              ) : compiledHtml !== '' ? (
                /* Show error HTML in iframe even when hasValidPreview is false */
                <iframe
                  ref={iframeRef}
                  srcDoc={compiledHtml}
                  sandbox="allow-scripts allow-modals"
                  className="w-full h-full border-none"
                  title="Preview"
                />
              ) : (
                /* Waiting / auto-loading state */
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
          </Panel>
        </Group>

        {/* Command bubble — hidden in read-only mode */}
        {!isReadOnly && (
          <CommandBubble
            onClick={() => setIsCommandModalOpen(true)}
            onHistoryClick={() => setIsHistoryOpen(true)}
          />
        )}

        {isCommandModalOpen && (
          <CommandModal
            onClose={() => setIsCommandModalOpen(false)}
            visualEditMode={editMode === 'visual'}
            onToggleVisualEdit={(active) => setEditMode(active ? 'visual' : 'interaction')}
            activeTab={activeBottomTab}
            setActiveTab={(tab) => setActiveBottomTab(tab)}
          >
            <div className="h-full w-full flex flex-col">
              <div className={`w-full h-full ${activeBottomTab === 'chat' ? 'block' : 'hidden'}`}>
                <ChatInterface
                  isLoading={isGenerating}
                  onSendMessage={handleSendMessage}
                  selectedElement={selectedElement}
                />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'visual' ? 'block' : 'hidden'}`}>
                <Terminal ref={terminalRef} />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'code' ? 'flex' : 'hidden'}`}>
                <CodePanel />
              </div>
            </div>
          </CommandModal>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} fileTree={fileTree} files={files} projectId={projectId ?? null} />}
        {showGraph && <StateGraph fileTree={fileTree} onClose={() => setShowGraph(false)} />}
        {showShareModal && projectId && (
          <ShareProjectModal
            projectId={projectId}
            projectName={currentProjectName}
            onClose={() => setShowShareModal(false)}
          />
        )}

        <HistoryDrawer
          projectId={projectId ?? null}
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          onRestore={async (tree) => {
            const restoredFiles = fileSystemTreeToMap(tree);
            for (const [path, content] of restoredFiles) {
              updateLocalFile(path, content);
              await saveFile(path, content);
            }

            // Force immediate recompile after restore
            setIsCompiling(true);
            try {
              const html = await compile(restoredFiles);
              setCompiledHtml(html);
              if (!html.includes('Compilation Error')) {
                setHasValidPreview(true);
                setShowTemplateSelector(false);
              }
            } catch (e) {
              console.error('[Restore] Compile error:', e);
            } finally {
              setIsCompiling(false);
            }

            setIsHistoryOpen(false);
          }}
          currentTree={fileTree}
        />
      </div>
    </ProtectedRoute>
  );
}
