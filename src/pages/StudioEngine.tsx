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
import { ChatInterface, type Message } from '../components/ChatInterface';
import { Terminal, type TerminalRef } from '../components/Terminal';
import { PreviewOverlay } from '../components/PreviewOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { AIOrchestrator } from '../services/AIOrchestrator';
import { SupabaseService } from '../services/SupabaseService';
import { compile, isPreviewError } from '../services/BrowserCompiler';
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
import { DesignBriefService } from '../services/DesignBriefService';
import CreditBalance from '../components/forge/CreditBalance';
import { ShareProjectModal } from '../components/forge/ShareProjectModal';
import { CodePanel } from '../components/studio/CodePanel';
import { NavigatePanel } from '../components/studio/NavigatePanel';

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
  // CAMBIO 2 — overlay "Generando tu proyecto…"
  //
  // hasBuiltProject = true significa que el proyecto ya tiene un bundle propio:
  // o completó una generación en esta sesión, o al entrar ya tenía historial de
  // intents (proyecto ya construido). En ese caso NO se muestra el overlay en
  // generaciones sucesivas — solo aplica a la PRIMERA construcción, para no
  // enseñar el scaffold crudo de React+Vite (template flash).
  //
  // awaitingFirstBuildCompile tapa el hueco entre que termina la primera
  // generación (isGenerating → false) y llega su primer compile: sin él el
  // scaffold parpadearía ~300ms antes de mostrar el resultado real.
  const [hasBuiltProject, setHasBuiltProject] = useState(false);
  const [awaitingFirstBuildCompile, setAwaitingFirstBuildCompile] = useState(false);
  const [generationProgress, setGenerationProgress] =
    useState<{ step: number; total: number; file: string } | null>(null);

  // CAMBIO 1 — dedup de errores de runtime reportados al chat. El mismo error
  // puede llegar dos veces en la misma carga (window.onerror + ErrorBoundary);
  // este Set evita duplicar el mensaje de sistema. Se vacía en cada nueva carga
  // del preview (cambio de compiledHtml) para que un bug persistente vuelva a
  // reportarse tras cada recompilación.
  const reportedRuntimeErrors = useRef<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // UI state
  // -------------------------------------------------------------------------
  const [showSettings, setShowSettings] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [isMenuPanelOpen, setIsMenuPanelOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<TargetElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // Historial de chat elevado al padre para que sobreviva a los desmontajes del
  // CommandModal. Almacena los objetos Message COMPLETOS (role, content y los
  // opcionales warning/suggestedAction/errorType/errorDetail) que maneja
  // ChatInterface, no la versión pelada {role, content}.
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
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
  const lastChangeSource = useRef<'ai' | 'user' | 'visual'>('user');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<TerminalRef>(null);

  const [isPublic, setIsPublic] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState<string>('');
  const [isProjectReady, setIsProjectReady] = useState(false);

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
      setIsProjectReady(true);

      // CAMBIO 2: un proyecto con historial de intents ya está construido — tiene
      // bundle propio, así que las generaciones futuras NO muestran el overlay
      // "Generando…" (solo la primera construcción lo necesita).
      const { data: intentRows } = await supabase
        .from('forge_intent_log')
        .select('id')
        .eq('project_id', projectId)
        .limit(1);
      if (intentRows && intentRows.length > 0) setHasBuiltProject(true);

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
  // Reset del historial de chat al cambiar de proyecto.
  //
  // La ruta es `studio/:projectId` sin `key`, así que navegar entre proyectos
  // NO remonta StudioEngine: el estado chatHistory sobreviviría. Como ahora
  // ChatInterface rehidrata messages desde chatHistory, sin este reset el chat
  // de un proyecto se filtraría al siguiente. Este efecto keyed en projectId es
  // el mecanismo que garantiza que no haya fuga de historial entre proyectos.
  // -------------------------------------------------------------------------
  useEffect(() => {
    setChatHistory([]);
  }, [projectId]);

  // -------------------------------------------------------------------------
  // AI callback registration
  // -------------------------------------------------------------------------
  useEffect(() => {
    AIOrchestrator.setFileUpdateCallback((path, content) => {
      console.log('[StudioEngine] file-update event received', { path,
        activeProject: projectId });
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

    // Guard: skip debounce only for immediate visual edits that already re-compiled — skip debounce
    if (lastChangeSource.current === 'visual') {
      return;
    }

    if (isGenerating) return; // no compilar en medio de la generación del AI

    const timer = setTimeout(async () => {
      setIsCompiling(true);
      try {
        const html = await compile(files);
        setCompiledHtml(html);
        const compiledOk = !isPreviewError(html);
        if (compiledOk) setHasValidPreview(true);
        // CAMBIO 2: el primer compile tras la primera generación baja el overlay
        // pase lo que pase, para que un error (compilación o red) sea visible en
        // vez de quedar tapado por "Generando…". Solo un compile exitoso marca el
        // proyecto como construido (bundle propio).
        if (awaitingFirstBuildCompile) {
          setAwaitingFirstBuildCompile(false);
          if (compiledOk) setHasBuiltProject(true);
        }
      } catch (e: any) {
        console.error('[StudioEngine] Compile error:', e);
      } finally {
        setIsCompiling(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [files, isGenerating]);

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
    if (!isProjectReady) return;
    if (isLoading) return;
    if (!initialPrompt) return;
    if (hasProcessedInitialPrompt.current) return;
    if (isAutoLoadingTemplate.current) return;

    // One-shot consumption of the navigation state, BEFORE dispatching.
    // initialPrompt travels in location.state, which the browser persists in the
    // history entry: back-navigation, refresh, or any router restoration would
    // re-deliver it and re-fire the whole generation. Capture the prompt into a
    // local, mark it processed, and clear the state from the current history
    // entry. Same pathname + replace => react-router does NOT remount (the route
    // match is unchanged), it only drops the stale state.
    const promptToRun = initialPrompt;
    hasProcessedInitialPrompt.current = true;
    navigate(location.pathname, { replace: true, state: null });

    void (async () => {
      // Belt-and-suspenders persistent idempotency guard: the ref + state clearing
      // above cover the common cases, but exotic restorations could still slip a
      // stale state through. If this project already has ANY forge_intent_log row
      // it is no longer virgin — the initialPrompt must never fire again.
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data, error } = await supabase
          .from('forge_intent_log')
          .select('id')
          .eq('project_id', projectId)
          .limit(1);
        if (!error && data && data.length > 0) {
          console.log('[StudioEngine] initialPrompt suppressed: project has history');
          return;
        }
      } catch {
        // Query failure: fail open on the first run so a transient DB error does
        // not block a legitimate initial generation.
      }

      if (files.size > 0) {
        handleSendMessage(promptToRun);
      } else {
        isAutoLoadingTemplate.current = true;
        const loadedFiles = await handleLoadTemplate('landing-page');
        // New-project scaffold: generate the per-project design brief and
        // persist DESIGN.md + brand CSS vars + Google Fonts BEFORE the first
        // generation, so every lane sees the brief. Best-effort — a null result
        // (API/JSON failure) leaves the scaffold untouched.
        const briefFiles = await applyDesignBrief(promptToRun, loadedFiles);
        handleSendMessage(promptToRun, undefined, undefined, briefFiles);
      }
    })();
  }, [isProjectReady, isLoading]);

  // -------------------------------------------------------------------------
  // Auto-load template silently when files are empty (Prompt 4)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isProjectReady) return;
    if (isLoading) return;
    if (files.size > 0) return;
    if (hasProcessedInitialPrompt.current) return;
    handleLoadTemplate('landing-page');
  }, [isProjectReady, isLoading, files.size]);

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
  const handleLoadTemplate = async (templateKey: string): Promise<Map<string, string>> => {
    const template = TEMPLATES[templateKey];
    if (!template) return new Map();

    const flatFiles = fileSystemTreeToMap(template);

    console.log([...flatFiles.keys()]);

    for (const [path, content] of flatFiles) {
      updateLocalFile(path, content);
      await saveFile(path, content);
    }

    await saveSnapshot('template_load');

    return flatFiles;
  };

  // -------------------------------------------------------------------------
  // Design brief scaffold — generate DESIGN.md + brand CSS vars + fonts and
  // persist them onto the freshly-loaded template. Returns the merged files map
  // (brief applied) so the first generation runs against it. On any failure the
  // original template files are returned unchanged (never blocks creation).
  // -------------------------------------------------------------------------
  const applyDesignBrief = async (
    prompt: string,
    templateFiles: Map<string, string>
  ): Promise<Map<string, string>> => {
    try {
      const briefFiles = await DesignBriefService.scaffold(prompt, templateFiles);
      if (!briefFiles || briefFiles.size === 0) return templateFiles;

      const merged = new Map(templateFiles);
      for (const [path, content] of briefFiles) {
        updateLocalFile(path, content);
        await saveFile(path, content);
        merged.set(path, content);
      }
      return merged;
    } catch (e) {
      console.error('[StudioEngine] applyDesignBrief failed, continuing without brief:', e);
      return templateFiles;
    }
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
    if (updatedMap.size === 0) return;
    compile(updatedMap).then(html => {
      setCompiledHtml(html);
      if (!isPreviewError(html)) setHasValidPreview(true);
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
    if (updatedMap.size === 0) return;
    compile(updatedMap).then(html => {
      setCompiledHtml(html);
      if (!isPreviewError(html)) setHasValidPreview(true);
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
    if (updatedMap.size === 0) return;
    compile(updatedMap).then(html => {
      setCompiledHtml(html);
      if (!isPreviewError(html)) setHasValidPreview(true);
    }).catch(e => console.error('[StudioEngine] immediate compile error:', e));
  };

  // -------------------------------------------------------------------------
  // AI chat handler
  // -------------------------------------------------------------------------
  const handleSendMessage = async (
    message: string,
    onProgress?: (step: number, total: number, file: string) => void,
    onRetry?: (attempt: number, error: string) => void,
    filesOverride?: Map<string, string>
  ): Promise<{ success: boolean; modifiedFiles: string[]; error?: string; warning?: string; chatResponse?: string; suggestedAction?: string }> => {
    if (isReadOnly) return { success: false, modifiedFiles: [] };
    setIsGenerating(true);
    setGenerationProgress(null);

    terminalRef.current?.clear();
    terminalRef.current?.write('\r\n\x1b[33m⚡ Starting build...\x1b[0m\r\n');

    try {
      lastChangeSource.current = 'ai';
      const activeFiles = filesOverride ?? files;
      const result = await AIOrchestrator.parseUserCommand(
        message,
        activeFiles,
        selectedElement,
        projectId,
        (step, total, file) => {
          terminalRef.current?.write(
            `\r\n\x1b[32m  [${step}/${total}] Writing ${file}\x1b[0m`
          );
          // CAMBIO 2: alimenta la línea secundaria del overlay de generación.
          setGenerationProgress({ step, total, file });
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
        // Aislamiento del contexto del modelo: el display history puede crecer
        // a 30 mensajes enriquecidos, pero el pipeline de AI sigue recibiendo el
        // mismo volumen de antes (últimos 10) y en la firma pelada {role,
        // content} que consume el orchestrator. Display history y model context
        // son cosas distintas: subir el cap de display no debe multiplicar tokens.
        chatHistory.slice(-10).map(({ role, content }) => ({ role, content }))
      );
      if (result.modifiedFiles.length > 0) {
        await saveSnapshot('ai_action');
      }

      const success = result.outcome !== 'failed';
      // CAMBIO 2: primera construcción completada con archivos escritos → manten
      // el overlay hasta que su primer compile exitoso aterrice (lo baja el
      // efecto de compilación), evitando el flash del scaffold entre medias.
      if (success && result.modifiedFiles.length > 0 && !hasBuiltProject) {
        setAwaitingFirstBuildCompile(true);
      }
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
        chatResponse: result.chatResponse,
        suggestedAction: result.suggestedAction,
      };
    } catch (error) {
      console.error('[StudioEngine] Error processing message:', error);
      terminalRef.current?.write('\r\n\x1b[31m❌ Unexpected error.\x1b[0m\r\n');
      return { success: false, modifiedFiles: [] };
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  // -------------------------------------------------------------------------
  // Download project as ZIP
  // -------------------------------------------------------------------------
  const downloadProject = async () => {
    // Flush any in-flight local writes so the zip reflects the freshest client
    // state (forge_files / the in-memory filesObj), then package every project
    // file preserving its real folder structure (src/…, public/…, package.json,
    // index.html, DESIGN.md). Client-side only — no server call, no LLM.
    await flushPendingWrites();
    const zip = new JSZip();
    for (const [path, content] of files) {
      zip.file(path, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const slug =
      (currentProjectName || 'project')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project';
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${slug}.zip`;
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

  // CAMBIO 2: overlay de generación. Solo en la PRIMERA construcción (sin bundle
  // propio todavía) y mientras la generación corre o esperamos su primer compile.
  const showGeneratingOverlay =
    !hasBuiltProject && (isGenerating || awaitingFirstBuildCompile);

  // -------------------------------------------------------------------------
  // Navigate panel state (panel extraído a src/components/studio/NavigatePanel)
  // -------------------------------------------------------------------------
  const [activeRoute, setActiveRoute] = useState<string>('/');

  // Sincronización inversa (preview → panel): el NavigationBridge del preview
  // emite 'route-changed' en cada cambio de ruta interno (Links del router,
  // redirecciones como el "Return to Home" del 404) y en el mount inicial. Así
  // el activeRoute del panel refleja la navegación que ocurre dentro del iframe.
  // Mismo patrón/cleanup que los listeners de mensajes existentes (PreviewOverlay).
  useEffect(() => {
    const handleRouteChanged = (event: MessageEvent) => {
      if (event.data?.type === 'route-changed' && typeof event.data.path === 'string') {
        // Normalizar: la ruta index del router ('/') es la misma que el panel.
        const path = event.data.path === '' ? '/' : event.data.path;
        setActiveRoute(path);
      }
    };
    window.addEventListener('message', handleRouteChanged);
    return () => window.removeEventListener('message', handleRouteChanged);
  }, []);

  // -------------------------------------------------------------------------
  // CAMBIO 1 (c/d) — errores de runtime del preview → mensaje honesto en el chat
  //
  // El PREVIEW_CLIENT_SCRIPT (window.onerror/unhandledrejection) y el
  // ErrorBoundary del preview emiten { type: 'preview-runtime-error', ... } con
  // el stack REAL. Aquí se traduce a un mensaje de sistema en el chat con la
  // acción "Corregir con AI": un prompt prellenado con el error y stack reales.
  // NO se auto-dispara el fix — el usuario decide (misma filosofía de
  // consentimiento que el fix del initialPrompt). La fila en forge_intent_log
  // solo se crea si el usuario dispara el fix, porque el stack viaja dentro del
  // user_prompt y es el pipeline quien registra el intent al procesarlo.
  useEffect(() => {
    const handleRuntimeError = (event: MessageEvent) => {
      if (event.data?.type !== 'preview-runtime-error') return;
      const { message, filename, lineno, componentName, componentStack, stack } = event.data;
      const where = componentName || filename || 'el preview';

      // Dedup por carga: un mismo error de render llega por DOS vías (el
      // ErrorBoundary y window.onerror), con prefijos distintos ("Uncaught ",
      // "Unhandled promise rejection: "). Normalizamos el mensaje para colapsar
      // ambas en una sola entrada de chat por carga del preview.
      const signature = String(message ?? '')
        .replace(/^Uncaught\s+/i, '')
        .replace(/^Unhandled promise rejection:\s*/i, '')
        .trim();
      if (reportedRuntimeErrors.current.has(signature)) return;
      reportedRuntimeErrors.current.add(signature);

      const fixPrompt = [
        'Corrige este error de runtime que ocurre en el preview.',
        '',
        `Error: ${message ?? '(sin mensaje)'}`,
        `Ubicación: ${where}${lineno ? `:${lineno}` : ''}`,
        stack ? `\nStack:\n${stack}` : '',
        componentStack ? `\nComponent stack:\n${componentStack}` : '',
      ].filter(Boolean).join('\n');

      setChatHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠ Error de runtime en el preview: ${message ?? 'error desconocido'} en ${where}`,
          actionLabel: 'Corregir con AI',
          suggestedAction: fixPrompt,
        } as Message,
      ].slice(-30));
    };
    window.addEventListener('message', handleRuntimeError);
    return () => window.removeEventListener('message', handleRuntimeError);
  }, []);

  // Cada nueva carga del preview (nuevo srcdoc) reinicia el dedup de errores de
  // runtime del lado del Studio, en línea con el dedup por-carga del iframe.
  useEffect(() => {
    reportedRuntimeErrors.current = new Set();
  }, [compiledHtml]);

  // -------------------------------------------------------------------------
  // CAMBIO 3 — reintento manual del compile ante un error de RED del cliente.
  // La página de error de red del preview emite { type: 'preview-retry-compile' }
  // al pulsar "Reintentar"; aquí se recompila con los archivos actuales.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleRetryCompile = (event: MessageEvent) => {
      if (event.data?.type !== 'preview-retry-compile') return;
      if (files.size === 0) return;
      setIsCompiling(true);
      compile(files)
        .then(html => {
          setCompiledHtml(html);
          if (!isPreviewError(html)) setHasValidPreview(true);
        })
        .catch(e => console.error('[StudioEngine] retry compile error:', e))
        .finally(() => setIsCompiling(false));
    };
    window.addEventListener('message', handleRetryCompile);
    return () => window.removeEventListener('message', handleRetryCompile);
  }, [files]);

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

              {/* CAMBIO 2: overlay "Generando tu proyecto…" — tapa el scaffold
                  crudo de React+Vite durante la primera construcción. Brand Wyrd:
                  fondo neutro + spinner + paso actual. z-40 deja accesibles el
                  botón de menú y los badges (z-50). */}
              {showGeneratingOverlay && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <div className="text-sm font-medium text-foreground">Generando tu proyecto…</div>
                  {generationProgress && (
                    <div className="text-xs text-muted-foreground font-mono max-w-[80%] truncate">
                      Paso {generationProgress.step}/{generationProgress.total} · {generationProgress.file}
                    </div>
                  )}
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
                  onHistoryUpdate={(history) => setChatHistory(history.slice(-30))}
                />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'visual' ? 'block' : 'hidden'}`}>
                <Terminal ref={terminalRef} />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'code' ? 'flex' : 'hidden'}`}>
                <CodePanel
                  files={files}
                  selectedFilePath={selectedFilePath}
                  selectedFileContent={selectedFileContent}
                  onFileSelect={handleFileSelect}
                  onCodeEdit={handleCodeEdit}
                  onSaveAndRun={saveAndRun}
                  isSaving={isSaving}
                  onDownloadZip={downloadProject}
                  isGenerating={isGenerating}
                />
              </div>
              <div className={`w-full h-full ${activeBottomTab === 'navigate' ? 'flex' : 'hidden'}`}>
                <NavigatePanel
                  files={files}
                  iframeRef={iframeRef}
                  activeRoute={activeRoute}
                  setActiveRoute={setActiveRoute}
                />
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
              if (restoredFiles.size === 0) return;
              const html = await compile(restoredFiles);
              setCompiledHtml(html);
              if (!isPreviewError(html)) {
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
