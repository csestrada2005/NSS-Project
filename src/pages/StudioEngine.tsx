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
  Loader2,
  Settings,
  Activity,
  Menu,
  Code,
  Eye,
  Share2,
  ChevronLeft,
  Flame,
  Clock,
  UserPlus,
  X as XIcon,
  Monitor,
  Tablet,
  Smartphone,
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

type TabType = 'chat' | 'visual' | 'code' | 'navigate';
type ViewportMode = 'mobile' | 'tablet' | 'desktop';


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
  const [showSettings, setShowSettings] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [isMenuPanelOpen, setIsMenuPanelOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<TargetElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [editMode, setEditMode] = useState<'interaction' | 'visual'>('interaction');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [activeBottomTab, setActiveBottomTab] = useState<TabType>('chat');
  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>(() => {
    return (localStorage.getItem('forge_viewport_mode') as ViewportMode) || 'desktop';
  });

  const handleViewportChange = (mode: ViewportMode) => {
    setViewportMode(mode);
    localStorage.setItem('forge_viewport_mode', mode);
  };

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

    // Guard: if last change was from a visual edit, we already compiled immediately — skip debounce
    if (lastChangeSource.current !== 'ai') {
      return;
    }

    const timer = setTimeout(async () => {
      setIsCompiling(true);
      try {
        const html = await compile(files);
        setCompiledHtml(html);
        if (!html.includes('Compilation Error')) {
          setHasValidPreview(true);
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

  const [isSaving, setIsSaving] = useState(false);

  const saveAndRun = async () => {
    if (!selectedFilePath) return;
    setIsSaving(true);
    try {
      lastChangeSource.current = 'user';
      updateLocalFile(selectedFilePath, selectedFileContent);
      await saveFile(selectedFilePath, selectedFileContent);
      toast.success('Saved successfully');
    } finally {
      setIsSaving(false);
    }
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

    const updatedMap = new Map(files);
    updatedMap.set(ACTIVE_FILE_PATH, newCode);
    compile(updatedMap).then(html => {
      setCompiledHtml(html);
      if (!html.includes('Compilation Error')) setHasValidPreview(true);
    }).catch(e => console.error('[StudioEngine] immediate compile error:', e));
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

    const updatedMap = new Map(files);
    updatedMap.set(ACTIVE_FILE_PATH, newCode);
    compile(updatedMap).then(html => {
      setCompiledHtml(html);
      if (!html.includes('Compilation Error')) setHasValidPreview(true);
    }).catch(e => console.error('[StudioEngine] immediate compile error:', e));

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
    lastChangeSource.current = 'user';
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

    const updatedMap = new Map(files);
    updatedMap.set(ACTIVE_FILE_PATH, files.get(ACTIVE_FILE_PATH) ?? '');
    compile(updatedMap).then(html => {
      setCompiledHtml(html);
      if (!html.includes('Compilation Error')) setHasValidPreview(true);
    }).catch(e => console.error('[StudioEngine] immediate compile error:', e));
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
        },
        chatHistory
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
  // Navigate panel
  // -------------------------------------------------------------------------
  const [activeRoute, setActiveRoute] = useState<string>('/');
  const NavigatePanel = () => {
    const pageFiles = Array.from(files.keys()).filter(path =>
      path.startsWith('src/pages/') &&
      (path.endsWith('.tsx') || path.endsWith('.jsx'))
    );

    const routes = pageFiles.map(path => {
      const name = path.replace('src/pages/', '').replace(/\.tsx?$/, '').replace(/\.jsx?$/, '');
      if (name === 'Index' || name === 'Home') return '/';
      return `/${name.toLowerCase()}`;
    }).sort((a, b) => a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b));

    const handleNavigate = (route: string) => {
      setActiveRoute(route);
      iframeRef.current?.contentWindow?.postMessage({ type: 'navigate', path: route }, '*');
    };

    return (
      <div className="flex flex-col w-full h-full bg-background">
        <div className="p-4 border-b border-border bg-card shrink-0">
          <h3 className="text-sm font-medium text-foreground mb-1">Project Map</h3>
          <p className="text-xs text-muted-foreground">Select a route to navigate the preview.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {routes.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">No routes found</div>
          ) : (
            routes.map(route => {
              const isActive = activeRoute === route;
              return (
                <button
                  key={route}
                  onClick={() => handleNavigate(route)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left ${isActive ? 'bg-primary/10 border border-primary/30 text-primary' : 'text-foreground hover:bg-accent border border-transparent'}`}
                >
                  <code className={`text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-primary/20 text-primary' : 'bg-muted'}`}>{route}</code>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

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
            disabled={!selectedFilePath || isSaving}
            className="px-3 py-1 bg-primary hover:bg-primary/90 text-white text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save & Run'}
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

              {/* Menu button — top left */}
              <div className="absolute top-4 left-4 z-50">
                <button
                  onClick={() => setIsMenuPanelOpen(true)}
                  className="p-2 bg-background/90 hover:bg-accent border border-border rounded-lg shadow-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Menu"
                >
                  <Menu size={18} />
                </button>
              </div>

              {/* Slide-in left panel */}
              {isMenuPanelOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/60"
                  onClick={() => setIsMenuPanelOpen(false)}
                />
              )}
              <div
                className={`fixed left-0 top-0 h-full w-72 z-[60] bg-card border-r border-border flex flex-col transition-transform duration-300 ${isMenuPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
              >
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <Flame size={18} className="text-primary" />
                    <span className="font-semibold text-foreground">Wyrd Forge</span>
                  </div>
                  <button
                    onClick={() => setIsMenuPanelOpen(false)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <XIcon size={16} />
                  </button>
                </div>

                {/* Navigation items */}
                <div className="flex flex-col py-2">
                  <button
                    onClick={() => { setIsMenuPanelOpen(false); navigate('/'); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <ChevronLeft size={16} />
                    Back to Nebu
                  </button>
                  <button
                    onClick={() => { setIsMenuPanelOpen(false); setIsHistoryOpen(true); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Clock size={16} />
                    Version History
                  </button>
                </div>

                <div className="h-px bg-border mx-5" />

                <div className="flex flex-col py-2">
                  <button
                    onClick={() => { setIsMenuPanelOpen(false); downloadProject(); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Download size={16} />
                    Export Zip
                  </button>
                  <button
                    onClick={() => { setIsMenuPanelOpen(false); setShowGraph(true); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Activity size={16} />
                    Visual Graph
                  </button>
                  <button
                    onClick={() => { setIsMenuPanelOpen(false); togglePublicAccess(); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Share2 size={16} />
                    {isPublic ? 'Unshare' : 'Share'}
                  </button>
                  <button
                    onClick={() => { setIsMenuPanelOpen(false); setShowShareModal(true); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <UserPlus size={16} />
                    Invite Collaborators
                  </button>
                </div>
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
                <div className="absolute top-14 right-4 z-40 flex flex-col items-end gap-2">
                  <CreditBalance />
                  {isPublic && (
                    <div className="flex items-center gap-1.5 bg-green-950/80 border border-green-700/50 rounded-full px-2.5 py-1 text-[10px] text-green-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </div>
                  )}
                </div>
              )}

              {/* Main content area */}
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                  <Loader2 className="animate-spin w-8 h-8" />
                  <div>Loading project...</div>
                </div>
              ) : hasPreview ? (
                <div className={`relative w-full h-full ${viewportMode !== 'desktop' ? 'bg-zinc-900 flex items-start justify-center' : ''}`}>
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
                    <div className="border-l border-border mx-1" />
                    <button
                      onClick={() => handleViewportChange('desktop')}
                      className={`px-2 py-1.5 text-xs font-medium transition-colors ${viewportMode === 'desktop' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      title="Desktop"
                    >
                      <Monitor size={13} />
                    </button>
                    <button
                      onClick={() => handleViewportChange('tablet')}
                      className={`px-2 py-1.5 text-xs font-medium transition-colors ${viewportMode === 'tablet' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      title="Tablet (768px)"
                    >
                      <Tablet size={13} />
                    </button>
                    <button
                      onClick={() => handleViewportChange('mobile')}
                      className={`px-2 py-1.5 text-xs font-medium transition-colors ${viewportMode === 'mobile' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      title="Mobile (390px)"
                    >
                      <Smartphone size={13} />
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
                  {!isCompiling && !hasValidPreview && compiledHtml !== '' && (
                    <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 bg-card/90 border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">
                      <Loader2 size={12} className="animate-spin" />
                      Compiling preview...
                    </div>
                  )}

                  {isIndexing && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="animate-spin text-red-500" size={28} />
                      <p className="text-sm text-gray-400 font-mono">Analyzing project structure...</p>
                    </div>
                  )}

                  {viewportMode === 'desktop' ? (
                    <div className="relative w-full h-full">
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
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center h-full"
                      style={{ width: viewportMode === 'mobile' ? 390 : 768 }}
                    >
                      <div className="text-xs text-zinc-500 py-1 shrink-0">
                        {viewportMode === 'mobile' ? '390px' : '768px'}
                      </div>
                      <div className="relative flex-1 w-full overflow-hidden">
                        <iframe
                          ref={iframeRef}
                          srcDoc={compiledHtml}
                          sandbox="allow-scripts allow-modals"
                          className="w-full h-full border border-zinc-600 rounded-t-lg"
                          title="Preview"
                        />
                        <PreviewOverlay
                          iframeRef={iframeRef}
                          onElementSelect={handleElementSelect}
                          editMode={editMode}
                          onUpdateStyle={handleStyleUpdate}
                          onUpdateText={handleTextUpdate}
                        />
                      </div>
                    </div>
                  )}

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
                  chatHistory={chatHistory}
                  onHistoryUpdate={(history) => setChatHistory(history.slice(-10))}
                />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'visual' ? 'block' : 'hidden'}`}>
                <Terminal ref={terminalRef} />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'code' ? 'flex' : 'hidden'}`}>
                <CodePanel />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'navigate' ? 'flex' : 'hidden'}`}>
                <NavigatePanel />
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
