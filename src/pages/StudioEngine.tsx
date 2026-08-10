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
import { PropertyPanel } from '../components/studio/PropertyPanel';
import { AIOrchestrator } from '../services/AIOrchestrator';
import { SupabaseService } from '../services/SupabaseService';
import { compileWithMeta, classifyCompileResult, isPreviewError, type OidMap } from '../services/BrowserCompiler';
import { isAbortError } from '../utils/abort';
import { updateCode, type TargetElement } from '../utils/ast';
import { fileSystemTreeToMap, mapToFileSystemTree } from '../utils/context';
import type { FileSystemTree } from '@webcontainer/api';
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
import { ChatPersistenceService } from '../services/ChatPersistenceService';
import { DesignBriefService } from '../services/DesignBriefService';
import CreditBalance from '../components/forge/CreditBalance';
import { ShareProjectModal } from '../components/forge/ShareProjectModal';
import { CodePanel } from '../components/studio/CodePanel';
import { NavigatePanel } from '../components/studio/NavigatePanel';

type TabType = 'chat' | 'visual' | 'code' | 'navigate';
type ViewportMode = 'mobile' | 'tablet' | 'desktop';

// CAMBIO 1 — una mutación visual pendiente de guardar. Se indexa por
// `oid::property` en el buffer (el último gana), y guarda todo lo que updateCode
// necesita para reescribir la fuente por ordinal cuando el usuario pulsa Guardar.
interface PendingVisualEdit {
  oid: string;
  filePath: string;
  ordinal: number;
  tagName: string;
  property: 'className' | 'text';
  value: string;
  classNameMode?: 'replace' | 'merge';
}

// PR-2: parse a compile-time oid ("{fileSlug}:{ordinal}") into its parts. The
// slug is a project path minus extension (never contains a colon), so we split on
// the LAST colon. `ordinal` is the 0-based native-element index within the file.
function parseOid(oid: string): { slug: string; ordinal: number } | null {
  const idx = oid.lastIndexOf(':');
  if (idx < 0) return null;
  const slug = oid.slice(0, idx);
  const ordinal = parseInt(oid.slice(idx + 1), 10);
  if (!slug || Number.isNaN(ordinal)) return null;
  return { slug, ordinal };
}

// Fecha legible para el mensaje de sistema del restore ("restaurado a la
// versión de …"). Mismo formato local que usa el HistoryDrawer.
function formatSnapshotDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Recorte determinista para labels de snapshot: colapsa espacios y trunca a
// `max` caracteres con elipsis. Sin LLM, mismo resultado para el mismo input.
function truncateLabel(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Nombre de componente a partir de un path del proyecto: basename sin extensión
// ("src/components/HeroSection.tsx" → "HeroSection").
function componentNameFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.[^./]+$/, '') || base;
}

// Resumen corto y DETERMINISTA de una sesión de guardado visual, derivado de las
// propiedades tocadas (className → "estilo", text → "texto") y de los archivos
// afectados (→ nombre de componente). Sin LLM. Ej.: "estilo y texto en HeroSection".
function summarizeVisualEdits(
  touchedFiles: string[],
  byFile: Map<string, PendingVisualEdit[]>,
): string {
  const props = new Set<string>();
  for (const path of touchedFiles) {
    for (const e of byFile.get(path) ?? []) {
      props.add(e.property === 'className' ? 'estilo' : 'texto');
    }
  }
  // Orden fijo: "estilo" antes que "texto", para que el mismo set produzca
  // siempre el mismo texto.
  const propLabel = ['estilo', 'texto'].filter((p) => props.has(p)).join(' y ');

  const components: string[] = [];
  for (const path of touchedFiles) {
    const name = componentNameFromPath(path);
    if (!components.includes(name)) components.push(name);
  }
  const compLabel = components.length <= 2
    ? components.join(' y ')
    : `${components.slice(0, 2).join(', ')} y ${components.length - 2} más`;

  if (!propLabel) return compLabel;
  if (!compLabel) return propLabel;
  return `${propLabel} en ${compLabel}`;
}

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

  // CAMBIO 3 (pasajero) — capturado UNA vez en el montaje. Sobrevive al borrado
  // de location.state (el efecto del initialPrompt limpia el state con replace),
  // así que sostiene el overlay "Generando…" desde el montaje hasta que arranca
  // la generación, sin la ventana de flash del scaffold. Se limpia cuando la
  // generación inicial arranca/termina o cuando se suprime (proyecto con
  // historial).
  const [awaitingInitialGeneration, setAwaitingInitialGeneration] = useState<boolean>(
    () => !!((location.state as { initialPrompt?: string } | null)?.initialPrompt)
  );

  // -------------------------------------------------------------------------
  // File state (replaces WebContainer + FileSystemTree)
  // -------------------------------------------------------------------------
  const { files, isLoading, loadFromSupabase, saveFile, deleteFile, updateLocalFile, flushPendingWrites } = useProjectFiles();

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
  // CAMBIO 2 — cancelación de la generación en curso. El AbortController se crea
  // por run en handleSendMessage; su signal se propaga a TODAS las llamadas fetch
  // (chat-forge/compile) del pipeline. `isCancelling` deshabilita el botón
  // Cancelar durante el cierre para evitar dobles cancelaciones.
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // CAMBIO 4 — estado post-cancelación honesto. Cuando un intent cierra con
  // outcome='cancelled' y todavía no hay build completo (hasBuiltProject=false),
  // el preview muestra la navbar generada sobre el template crudo — un estado
  // engañoso. `cancelledInfo` sostiene un overlay honesto ("Generación cancelada
  // — N componentes conservados" + "Completar proyecto") hasta que el primer
  // compile de una generación posterior lo reemplaza. Se limpia al arrancar la
  // siguiente generación.
  const [cancelledInfo, setCancelledInfo] = useState<{ count: number } | null>(null);
  // CAMBIO 4 — puente para enviar por el flujo normal del chat desde el botón
  // "Completar proyecto" del overlay (fuera del ChatInterface). Al setearse, el
  // ChatInterface lo auto-envía y lo consume.
  const [pendingChatSend, setPendingChatSend] = useState<string | null>(null);
  // Historial de chat elevado al padre para que sobreviva a los desmontajes del
  // CommandModal. Almacena los objetos Message COMPLETOS (role, content y los
  // opcionales warning/suggestedAction/errorType/errorDetail) que maneja
  // ChatInterface, no la versión pelada {role, content}.
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [editMode, setEditMode] = useState<'interaction' | 'visual'>('interaction');
  // CAMBIO 1 (sesión de edición con Guardar) — buffer de cambios visuales
  // pendientes. Los ajustes del panel aplican SOLO al DOM (optimista) y se
  // acumulan aquí, keyed por `oid::propiedad` (el último gana). Nada toca la
  // fuente ni compila hasta pulsar "Guardar cambios (N)". El flujo de texto usa
  // el mismo buffer. `previewReloadNonce` fuerza el remount del iframe al
  // Descartar (re-render del DOM desde el último estado compilado).
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingVisualEdit>>(new Map());
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  // Guarda de salida con cambios sin guardar: sostiene la acción diferida hasta
  // que el usuario resuelve el diálogo (Guardar / Descartar / Cancelar).
  const [pendingNavAction, setPendingNavAction] = useState<{ proceed: () => void } | null>(null);
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

  // CAMBIO 1 — el handler de 'preview-runtime-error' se registra con deps []
  // (no re-suscribe el listener en cada cambio de archivos). Para construir el
  // prompt del fix con el CONTENIDO ACTUAL de los archivos, leemos la última
  // versión vía ref en lugar de cerrar sobre el `files` del primer render.
  const filesRef = useRef(files);
  filesRef.current = files;

  // CAMBIO 2 — oidMap del último compile (slug → path completo). Lo puebla el
  // compilador (data-oid nace en compile-time) y aquí sólo se guarda para PR-2
  // (picker / fast lane / targeting determinista). Sin consumidores todavía.
  const oidMapRef = useRef<OidMap>({});

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
  // Reset + rehidratación del historial de chat al cambiar de proyecto.
  //
  // La ruta es `studio/:projectId` sin `key`, así que navegar entre proyectos
  // NO remonta StudioEngine: el estado chatHistory sobreviviría. Como ahora
  // ChatInterface rehidrata messages desde chatHistory, sin este reset el chat
  // de un proyecto se filtraría al siguiente. Este efecto keyed en projectId es
  // el mecanismo que garantiza que no haya fuga de historial entre proyectos.
  //
  // ORDEN CRÍTICO contra la carrera: el reset síncrono `setChatHistory([])` se
  // ejecuta al TOPE del efecto, ANTES de disparar el fetch async — así el reset
  // siempre ocurre antes de que la carga resuelva. La carga lleva un guard de
  // projectId vigente vía el flag `cancelled` atado al cleanup del efecto: si el
  // projectId cambia mientras el fetch vuela, React corre el cleanup (marca
  // cancelled=true) antes del nuevo efecto, y el resultado stale se descarta. Un
  // fetch tardío de un proyecto anterior nunca pisa el chat del proyecto actual.
  // -------------------------------------------------------------------------
  useEffect(() => {
    // 1. Reset síncrono: limpia cualquier historial del proyecto anterior.
    setChatHistory([]);
    if (!projectId) return;

    // 2. Carga async con guard de projectId vigente.
    let cancelled = false;
    ChatPersistenceService.loadRecent(projectId)
      .then((messages) => {
        if (cancelled) return; // el projectId cambió mientras el fetch volaba.
        if (messages.length === 0) return;
        // Guard extra contra la carrera con actividad local: si el usuario ya
        // generó mensajes reales mientras el fetch volaba (prev no vacío), NO
        // los pisamos con el historial cargado. El saludo pelado no se propaga
        // al padre, así que prev vacío == "aún no hay mensajes reales".
        setChatHistory((prev) => (prev.length === 0 ? messages : prev));
      })
      .catch((err) => console.warn('[StudioEngine] chat history load failed:', err));

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Persiste un mensaje DEFINITIVO del chat en forge_chat_messages. Fire-and-
  // forget: NO se hace await (jamás bloquea el chat) y el servicio ya traga sus
  // propios errores a log. Se suprime en modo lectura (un visor sin permiso no
  // debe escribir) y sin projectId.
  const persistChatMessage = useCallback(
    (role: 'user' | 'assistant', content: string) => {
      if (isReadOnly || !projectId) return;
      void ChatPersistenceService.persistMessage(projectId, role, content);
    },
    [isReadOnly, projectId],
  );

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
  // CAMBIO 1 — Gobierno de la tasa de compiles del panel visual.
  //
  // (a) Debounce: los cambios aplican al DOM al instante (optimista) pero el
  //     compile se dispara UNA vez, 600ms después del último cambio.
  // (b) Serialización: nunca más de un compile en vuelo por proyecto. Si llega
  //     otro job con uno en vuelo, se encola SÓLO el más reciente (drop del
  //     intermedio). `runExclusive` es el único portón por el que pasan TODOS
  //     los compiles del cliente, así que las ráfagas de stepper ya no abren N
  //     compiles concurrentes contra esbuild.
  // -------------------------------------------------------------------------
  const COMPILE_DEBOUNCE_MS = 600;
  const compileInFlightRef = useRef(false);
  const pendingCompileJobRef = useRef<null | (() => Promise<void>)>(null);
  // Resolver de la promesa del job ENCOLADO, para que quien haga
  // `await runExclusive(...)` nunca quede colgado si su job es superado por uno
  // más reciente (drop del intermedio): al descartarlo, resolvemos su promesa.
  const pendingResolveRef = useRef<null | (() => void)>(null);

  // Devuelve una Promise<void> que resuelve cuando el job TERMINA (o cuando es
  // superado en la cola). Los callers fire-and-forget la ignoran; el restore la
  // AWAITEA para leer el veredicto real antes de componer su mensaje honesto
  // (antes `runExclusive` devolvía void, así que `await` resolvía de inmediato y
  // el mensaje se componía con el veredicto sin calcular — ver handleRestoreSnapshot).
  const runExclusive = useCallback((job: () => Promise<void>): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (compileInFlightRef.current) {
        // Uno en vuelo: quedarnos SÓLO con el estado más reciente. Si ya había
        // uno encolado, se descarta → resolvemos su promesa para no colgar a su
        // awaiter.
        pendingResolveRef.current?.();
        pendingCompileJobRef.current = job;
        pendingResolveRef.current = resolve;
        return;
      }
      compileInFlightRef.current = true;
      void (async () => {
        try {
          await job();
        } finally {
          resolve();
          compileInFlightRef.current = false;
          const next = pendingCompileJobRef.current;
          const nextResolve = pendingResolveRef.current;
          if (next) {
            pendingCompileJobRef.current = null;
            pendingResolveRef.current = null;
            runExclusive(next).then(() => nextResolve?.());
          }
        }
      })();
    });
  }, []);

  // CAMBIO 3 — el estado de error del preview SIEMPRE refleja el último compile.
  // Un compile exitoso limpia el estado de error (reemplaza el html del overlay
  // "Compilation failed"); combinado con la serialización de CAMBIO 1, un compile
  // viejo con error nunca puede aterrizar después de uno nuevo exitoso.
  const applyPreviewHtml = useCallback((html: string) => {
    setCompiledHtml(html);
    if (!isPreviewError(html)) setHasValidPreview(true);
  }, []);

  // Lectura por ref para que la lógica del compile no re-cree callbacks ni
  // re-programe el debounce en cada cambio de este flag.
  const awaitingFirstBuildCompileRef = useRef(false);
  awaitingFirstBuildCompileRef.current = awaitingFirstBuildCompile;

  // -------------------------------------------------------------------------
  // Debounced compilation whenever files change (fuente NO visual: AI, restore…)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (files.size === 0) return;

    // Los edits visuales gobiernan su propio compile (debounce + verify con
    // veredicto en applyVisualEdit); aquí no recompilamos por ellos.
    if (lastChangeSource.current === 'visual') {
      return;
    }

    if (isGenerating) return; // no compilar en medio de la generación del AI

    const timer = setTimeout(() => {
      runExclusive(async () => {
        setIsCompiling(true);
        try {
          const { html, oidMap, verdict } = await compileWithMeta(files);
          // CAMBIO 2 — guardar el oidMap de cada compile para PR-2 (sin consumidores
          // aún). Sólo se pisa con un mapa poblado: un compile con error de red o de
          // compilación devuelve {} y no debe borrar el último mapa válido.
          if (Object.keys(oidMap).length > 0) oidMapRef.current = oidMap;
          const firstBuild = awaitingFirstBuildCompileRef.current;
          // CAMBIO 2b — servidor ocupado en RÉGIMEN (ya hubo un build): NO pintamos
          // error, conservamos el último preview bueno; se reintenta al próximo
          // cambio. En el PRIMER build sí pintamos (aunque sea la página "servidor
          // ocupado" con reintento): un overlay "Generando…" sin salida es peor.
          if (verdict === 'server-error' && !firstBuild) {
            // no-op: conservar el preview actual
          } else {
            setCompiledHtml(html);
            const compiledOk = !isPreviewError(html);
            if (compiledOk) setHasValidPreview(true);
            // El primer compile tras la primera generación baja el overlay pase lo
            // que pase (error visible), pero sólo un compile OK marca hasBuiltProject.
            if (firstBuild) {
              setAwaitingFirstBuildCompile(false);
              if (compiledOk) setHasBuiltProject(true);
            }
          }
        } catch (e) {
          console.error('[StudioEngine] Compile error:', e);
        } finally {
          setIsCompiling(false);
        }
      });
    }, COMPILE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [files, isGenerating, runExclusive]);

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
          // CAMBIO 3 — generación suprimida: soltar el overlay de arranque.
          setAwaitingInitialGeneration(false);
          return;
        }
      } catch {
        // Query failure: fail open on the first run so a transient DB error does
        // not block a legitimate initial generation.
      }

      try {
        if (files.size > 0) {
          await handleSendMessage(promptToRun);
        } else {
          isAutoLoadingTemplate.current = true;
          const loadedFiles = await handleLoadTemplate('landing-page');
          // New-project scaffold: generate the per-project design brief and
          // persist DESIGN.md + brand CSS vars + Google Fonts BEFORE the first
          // generation, so every lane sees the brief. Best-effort — a null result
          // (API/JSON failure) leaves the scaffold untouched.
          const briefFiles = await applyDesignBrief(promptToRun, loadedFiles);
          await handleSendMessage(promptToRun, undefined, undefined, briefFiles);
        }
      } finally {
        // CAMBIO 3 — la generación inicial ya arrancó y terminó (isGenerating y
        // awaitingFirstBuildCompile toman el relevo del overlay si corresponde);
        // soltamos el flag de arranque para no dejar el overlay pegado.
        setAwaitingInitialGeneration(false);
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
  // Clear stale element selection after the AI modifies files — the ordinals a
  // selection depends on may have shifted. Only AI edits clear it; visual/user
  // edits keep the selection (they mutate a known element deterministically).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (lastChangeSource.current === 'ai') {
      iframeRef.current?.contentWindow?.postMessage({ type: 'clear-selection' }, '*');
      setSelectedElement(prev => (prev ? null : prev));
      // CAMBIO 1 — el buffer visual pendiente se construyó por ordinal contra la
      // fuente ANTERIOR; una regeneración del AI puede haber corrido esos
      // ordinales. Sus reflejos optimistas en el DOM ya los borra el recompile
      // del AI, así que el buffer stale se descarta (guardarlo podría corromper
      // elementos que no eran los editados).
      setPendingEdits(prev => (prev.size > 0 ? new Map() : prev));
    }
  }, [files]);

  // -------------------------------------------------------------------------
  // PR-2 — Visual mode wiring
  // -------------------------------------------------------------------------

  // Push the current edit mode into the iframe picker. Re-sent on an interval so a
  // preview reload (new srcdoc) re-syncs without a race.
  useEffect(() => {
    const send = () =>
      iframeRef.current?.contentWindow?.postMessage({ type: 'set-mode', mode: editMode }, '*');
    send();
    const interval = setInterval(send, 1000);
    return () => clearInterval(interval);
  }, [editMode]);

  // Leaving visual mode drops any selection (and its panel).
  useEffect(() => {
    if (editMode !== 'visual') setSelectedElement(null);
  }, [editMode]);

  // CAMBIO 1 (c) — guarda de salida a nivel de navegador (recarga/cierre de
  // pestaña) cuando hay cambios visuales sin guardar. Las salidas dentro de la
  // app (toggle a Interaction, "Back to Nebu", cambio de página) las cubre
  // guardUnsaved con el diálogo Guardar/Descartar.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingEditsRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Bridge (CAMBIO 2): the in-iframe picker posts 'element-selected' with the oid;
  // resolve it to { filePath, ordinal } via the last compile's oidMap. A stale map
  // that can't resolve the file triggers an honest toast + a fresh recompile.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'element-deselected') {
        setSelectedElement(null);
        return;
      }
      if (data?.type !== 'element-selected') return;

      const p = data.payload ?? {};
      const parsed = typeof p.oid === 'string' ? parseOid(p.oid) : null;
      if (!parsed) {
        setSelectedElement(null);
        return;
      }
      const filePath = oidMapRef.current[parsed.slug];
      if (!filePath) {
        toast.message('Recompilando para sincronizar…');
        if (files.size > 0) {
          setIsCompiling(true);
          runExclusive(async () => {
            try {
              const { html, oidMap, verdict } = await compileWithMeta(filesRef.current);
              if (Object.keys(oidMap).length > 0) oidMapRef.current = oidMap;
              if (verdict !== 'server-error') applyPreviewHtml(html);
            } catch (e) {
              console.error('[StudioEngine] resync compile error:', e);
            } finally {
              setIsCompiling(false);
            }
          });
        }
        return;
      }

      setSelectedElement({
        tagName: p.tagName,
        className: p.className,
        dataOid: p.oid,
        filePath,
        ordinal: parsed.ordinal,
        textContent: p.textContent,
        instanceCount: p.instanceCount,
        hasChildElements: p.hasChildElements,
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [files, runExclusive, applyPreviewHtml]);

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
    // Leemos por ref, no por el `files` del closure: cuando saveSnapshot corre al
    // cierre de una generación/fix, el `files` capturado en el render del handler
    // es anterior a las escrituras del AI. filesRef.current siempre refleja el
    // último estado comprometido, así que el snapshot captura lo recién escrito.
    const currentFiles = filesRef.current;
    if (currentFiles.size === 0) return;
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Flush all pending debounced writes before capturing the snapshot
      await flushPendingWrites();

      const fileTree = mapToFileSystemTree(currentFiles);

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

        // CAMBIO 2 — retención: tras cada insert, conservar los últimos 30 por
        // proyecto y borrar los más viejos, EXCEPTO los checkpoints etiquetados
        // por el usuario (trigger='manual'), que se preservan siempre.
        const { data: excess } = await supabase
          .from('forge_snapshots')
          .select('id')
          .eq('project_id', projectId)
          .neq('trigger', 'manual')
          .order('created_at', { ascending: false })
          .range(30, 1000);
        if (excess && excess.length > 0) {
          await supabase
            .from('forge_snapshots')
            .delete()
            .in('id', excess.map((r) => r.id));
        }

        // Retención de pre_restore: sólo el MÁS reciente sobrevive. Cada restore
        // deja un "Antes de restaurar"; acumularlos ensucia el drawer sin aportar
        // (el punto de vuelta útil es siempre el último). Podamos los anteriores.
        const { data: preRestores } = await supabase
          .from('forge_snapshots')
          .select('id')
          .eq('project_id', projectId)
          .eq('trigger', 'pre_restore')
          .order('created_at', { ascending: false });
        if (preRestores && preRestores.length > 1) {
          await supabase
            .from('forge_snapshots')
            .delete()
            .in('id', preRestores.slice(1).map((r) => r.id));
        }
      } catch (e) {
        console.error('[saveSnapshot] Failed:', e);
      }
    } catch (e) {
      console.error('[saveSnapshot] Error:', e);
    }
  }, [projectId, flushPendingWrites]);

  // Reintento con backoff tras un veredicto 'infra' del restore (servidor lento /
  // 5xx / red / sesión). compileWithMeta ya agotó SU backoff interno; esto vuelve
  // a intentar el compile completo unas pocas veces por si el servidor se
  // recupera, y refresca el preview cuando lo logra. Consume el MISMO clasificador
  // que el compile inicial: si tras recuperarse el código no compila, pinta el
  // error real; si compila, aplica el preview. El mensaje de chat ya emitido
  // ("el servidor tarda…") no se reescribe — el preview refleja el estado final.
  const retryRestorePreview = useCallback(
    (restoredFiles: Map<string, string>) => {
      const BACKOFFS_MS = [2000, 4000, 8000];
      let settled = false;
      const attempt = (i: number) => {
        if (settled || i >= BACKOFFS_MS.length) return;
        window.setTimeout(() => {
          if (settled) return;
          runExclusive(async () => {
            if (settled) return;
            const result = await compileWithMeta(restoredFiles);
            if (Object.keys(result.oidMap).length > 0) oidMapRef.current = result.oidMap;
            const decision = classifyCompileResult(result);
            if (decision.status === 'ok') {
              settled = true;
              applyPreviewHtml(result.html);
            } else if (decision.status === 'code-error') {
              settled = true;
              setCompiledHtml(result.html); // el servidor se recuperó: error real
            } else {
              attempt(i + 1); // sigue en infra: siguiente backoff
            }
          });
        }, BACKOFFS_MS[i]);
      };
      attempt(0);
    },
    [runExclusive, applyPreviewHtml],
  );

  // -------------------------------------------------------------------------
  // CAMBIO 1 — Restore por el embudo normal de escritura.
  //  b. Auto-snapshot del estado ACTUAL (pre_restore) → todo restore es reversible.
  //  c. file_tree del snapshot → mapa plano; escribir CADA archivo por el camino
  //     normal (updateLocalFile + saveFile: strip de oids incluido) y ELIMINAR
  //     los que existen hoy pero no en el snapshot (restore = estado completo).
  //  d. Recompilar por el flujo normal (setCompiledHtml limpia el overlay de
  //     error) y esperar el veredicto REAL (runExclusive ahora es awaitable).
  //  e. Mensaje de sistema en el chat (persiste): éxito → confirmación; infra →
  //     "el servidor tarda…" + reintento con backoff; no-compila → error real.
  // -------------------------------------------------------------------------
  const handleRestoreSnapshot = useCallback(
    async (tree: FileSystemTree, meta: { label: string | null; created_at: string; trigger: string }) => {
      if (isReadOnly || !projectId) return;

      // b. Checkpoint del estado actual antes de tocar nada.
      await saveSnapshot('pre_restore', 'Antes de restaurar');

      // c. Estado completo: escribir lo del snapshot, borrar lo que sobra.
      lastChangeSource.current = 'ai';
      const restoredFiles = fileSystemTreeToMap(tree);

      for (const path of Array.from(filesRef.current.keys())) {
        if (!restoredFiles.has(path)) {
          await deleteFile(path);
        }
      }
      for (const [path, content] of restoredFiles) {
        updateLocalFile(path, content);
        await saveFile(path, content);
      }
      await flushPendingWrites();

      setIsHistoryOpen(false);

      // d. Recompilar y esperar el veredicto REAL. `runExclusive` ya es awaitable,
      //    así que este await NO resuelve hasta que el job termina — el mensaje de
      //    abajo se compone con un veredicto realmente calculado (antes resolvía de
      //    inmediato y el mensaje veía compileError === undefined).
      //
      //    El veredicto se obtiene del ÚNICO clasificador compartido con el compile
      //    normal (classifyCompileResult) — no una reimplementación:
      //      - 'ok'         → éxito.
      //      - 'infra'      → server-error / network-error (timeout / 5xx / vacío /
      //                       red) O un compile-error sin mensaje real (sesión/401).
      //                       La versión SÍ se restauró: JAMÁS declaramos "no
      //                       compila". Mensaje "el servidor tarda…" + reintento.
      //      - 'code-error' → ÚNICO camino de no-compila. Trae el error REAL por
      //                       construcción del clasificador, nunca undefined.
      // Holder mutable (no una `let` local): TS estrecharía una `let` a su
      // literal inicial e ignoraría las reasignaciones dentro del closure para
      // las lecturas de fuera; leer una propiedad usa el tipo declarado.
      const restore: { outcome: 'ok' | 'infra' | 'code-error'; error: string } = {
        outcome: 'infra',
        error: '',
      };
      await runExclusive(async () => {
        setIsCompiling(true);
        try {
          if (restoredFiles.size === 0) { restore.outcome = 'ok'; return; }
          const result = await compileWithMeta(restoredFiles);
          if (Object.keys(result.oidMap).length > 0) oidMapRef.current = result.oidMap;
          const decision = classifyCompileResult(result);
          if (decision.status === 'ok') {
            setCompiledHtml(result.html);
            setHasValidPreview(true);
            restore.outcome = 'ok';
          } else if (decision.status === 'code-error') {
            setCompiledHtml(result.html); // página de error de compilación
            restore.outcome = 'code-error';
            restore.error = decision.error; // real, nunca undefined
          } else {
            // infra: conservar lo escrito, no pintar error (el reintento refresca).
            restore.outcome = 'infra';
          }
        } catch (e) {
          // compileWithMeta no lanza (devuelve veredictos). Un fallo inesperado del
          // cliente es infra, no un fallo del código restaurado: conservamos lo
          // escrito y reintentamos, sin declarar "no compila".
          console.error('[Restore] Compile error:', e);
          restore.outcome = 'infra';
        } finally {
          setIsCompiling(false);
        }
      });

      // Tras un veredicto de infra, reintentar el compile con backoff para
      // refrescar el preview cuando el servidor se recupere.
      if (restore.outcome === 'infra') {
        retryRestorePreview(restoredFiles);
      }

      // e. Mensaje de sistema en el chat (definitivo → se persiste).
      const dateLabel = formatSnapshotDate(meta.created_at);
      const labelSuffix = meta.label ? ` (${meta.label})` : '';
      const systemMessage =
        restore.outcome === 'ok'
          ? `Proyecto restaurado a la versión de ${dateLabel}${labelSuffix}.`
          : restore.outcome === 'infra'
            ? `El servidor tarda en responder — la versión se restauró; el preview se actualizará al terminar.`
            : `La versión restaurada no compila: ${restore.error}. Guardé un checkpoint "Antes de restaurar" para que puedas volver al estado anterior.`;

      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: systemMessage } as Message,
      ].slice(-30));
      persistChatMessage('assistant', systemMessage);
    },
    [
      isReadOnly,
      projectId,
      saveSnapshot,
      deleteFile,
      updateLocalFile,
      saveFile,
      flushPendingWrites,
      runExclusive,
      retryRestorePreview,
      persistChatMessage,
    ],
  );

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
  // Visual editing handlers (PR-2 — deterministic, zero-LLM)
  //
  // CAMBIO 1 — Sesión de edición con Guardar explícito. Flujo:
  //  a. Cada ajuste del panel aplica SOLO al DOM del iframe (optimista, sin
  //     flash) y se acumula en `pendingEdits` (keyed por oid::propiedad, el
  //     último gana). NO toca la fuente ni compila. El texto usa el mismo buffer.
  //  b. "Guardar cambios (N)" aplica TODAS las mutaciones a la fuente
  //     (updateCode secuencial por ordinal, agrupado por archivo), hace UN
  //     saveFile por archivo tocado y UNA sola compilación con manejo de
  //     veredicto (ok/compile-error/server-error/network-error).
  //  d. Descartar re-renderiza el DOM desde el último estado compilado
  //     (remonta el iframe → srcdoc del compiledHtml vigente).
  //  e. El runExclusive (serialización de compiles) queda como red de seguridad
  //     global — la compilación del guardado pasa por él como cualquier otra.
  // -------------------------------------------------------------------------

  // (a) Encolar un ajuste: reflejo optimista en el iframe + registro en el buffer.
  const stageVisualEdit = useCallback(
    (updates: { className?: string; textContent?: string }, options?: { classNameMode?: 'replace' | 'merge' }) => {
      const el = selectedElement;
      if (!el || !el.filePath || typeof el.ordinal !== 'number' || !el.dataOid) {
        toast.error('No pude aplicar el cambio con seguridad — usa el chat');
        return;
      }
      const { dataOid, filePath, ordinal, tagName } = el;

      // Reflejo optimista en el iframe — TODAS las instancias del oid.
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'apply-visual-edit', oid: dataOid, className: updates.className, text: updates.textContent },
        '*',
      );

      // Registro en el buffer (último gana por oid::propiedad).
      setPendingEdits(prev => {
        const next = new Map(prev);
        if (updates.className !== undefined) {
          next.set(`${dataOid}::className`, {
            oid: dataOid, filePath, ordinal, tagName,
            property: 'className', value: updates.className,
            classNameMode: options?.classNameMode ?? 'replace',
          });
        }
        if (updates.textContent !== undefined) {
          next.set(`${dataOid}::text`, {
            oid: dataOid, filePath, ordinal, tagName,
            property: 'text', value: updates.textContent,
          });
        }
        return next;
      });

      // Mantener el panel sincronizado con lo que muestra el DOM.
      if (updates.className !== undefined) {
        setSelectedElement(prev => (prev ? { ...prev, className: updates.className } : null));
      }
      if (updates.textContent !== undefined) {
        setSelectedElement(prev => (prev ? { ...prev, textContent: updates.textContent } : null));
      }
    },
    [selectedElement],
  );

  // (b) Guardar: aplicar todo el buffer a la fuente y compilar UNA vez.
  const saveVisualChanges = useCallback(async (): Promise<void> => {
    const edits = Array.from(pendingEditsRef.current.values());
    if (edits.length === 0) return;

    // Agrupar por archivo tocado.
    const byFile = new Map<string, PendingVisualEdit[]>();
    for (const e of edits) {
      const list = byFile.get(e.filePath);
      if (list) list.push(e);
      else byFile.set(e.filePath, [e]);
    }

    lastChangeSource.current = 'visual';
    // `baseline` = contenido PREVIO al guardado por archivo (para revertir si
    // compile-error). `finalFiles` = mapa completo con las mutaciones aplicadas,
    // construido explícitamente para no depender de un filesRef aún sin re-render.
    const baseline = new Map<string, string>();
    const finalFiles = new Map(filesRef.current);
    const touchedFiles: string[] = [];
    let anyNotFound = false;

    for (const [filePath, fileEdits] of byFile) {
      const original = filesRef.current.get(filePath);
      if (original === undefined) { anyNotFound = true; continue; }
      baseline.set(filePath, original);

      let code = original;
      for (const e of fileEdits) {
        const target: TargetElement = { tagName: e.tagName, ordinal: e.ordinal, filePath, dataOid: e.oid };
        const updates = e.property === 'className'
          ? { className: e.value }
          : { textContent: e.value };
        const opts = e.property === 'className' ? { classNameMode: e.classNameMode } : undefined;
        let notFound = false;
        code = updateCode(code, target, updates, opts, () => { notFound = true; });
        if (notFound) anyNotFound = true;
      }

      finalFiles.set(filePath, code);
      updateLocalFile(filePath, code);
      await saveFile(filePath, code); // UN saveFile por archivo tocado.
      touchedFiles.push(filePath);
    }

    // La fuente ya carga los cambios: vaciar el buffer.
    setPendingEdits(new Map());

    if (anyNotFound) {
      toast.error('Algunos cambios no se pudieron localizar — revisa el resultado');
    }

    // (b) UNA sola compilación, por la red de seguridad global (runExclusive).
    runExclusive(async () => {
      setIsCompiling(true);
      try {
        const result = await compileWithMeta(finalFiles, {
          onServerRetry: () => toast.message('Servidor ocupado — reintentando…'),
        });
        const { html, oidMap, verdict } = result;
        if (Object.keys(oidMap).length > 0) oidMapRef.current = oidMap;

        // MISMO clasificador que el restore (classifyCompileResult) — una sola
        // taxonomía para todo el que consume un compile.
        const decision = classifyCompileResult(result);

        if (decision.status === 'ok') {
          applyPreviewHtml(html);
          toast.success(`Cambios guardados (${touchedFiles.length} archivo${touchedFiles.length === 1 ? '' : 's'})`);
          // CAMBIO 2 — cierre exitoso de una sesión de guardado del modo Visual:
          // capturar snapshot por el mismo embudo que el resto de la cobertura,
          // con un label determinista derivado de lo que tocó el buffer.
          if (touchedFiles.length > 0) {
            const resumen = summarizeVisualEdits(touchedFiles, byFile);
            void saveSnapshot('manual_save', `Edición visual: ${resumen}`);
          }
          return;
        }
        if (decision.status === 'infra') {
          // server-error / red / sesión: NO revertir (la edición AST es
          // sintácticamente segura por construcción). Un compile-error SIN mensaje
          // real (sesión/401) ya NO revierte el cambio del usuario — cae aquí.
          if (verdict === 'network-error') {
            applyPreviewHtml(html); // flujo de red existente (página con reintento).
          } else {
            toast.message('Guardado — el preview se actualizará al reconectar');
          }
          return;
        }

        // decision.status === 'code-error': el cambio rompió la compilación →
        // revertir al baseline.
        toast.error('El cambio rompió la compilación — revertido');
        const reverted = new Map(finalFiles);
        for (const [path, original] of baseline) {
          updateLocalFile(path, original);
          void saveFile(path, original);
          reverted.set(path, original);
        }
        const revertRes = await compileWithMeta(reverted);
        applyPreviewHtml(revertRes.html);
      } catch (e) {
        console.error('[StudioEngine] visual save compile error:', e);
      } finally {
        setIsCompiling(false);
      }
    });
  }, [runExclusive, applyPreviewHtml, updateLocalFile, saveFile, saveSnapshot]);

  // (d) Descartar: soltar el buffer y re-renderizar el DOM desde el último
  // estado compilado (remonta el iframe → srcdoc del compiledHtml vigente).
  const discardVisualChanges = useCallback(() => {
    setPendingEdits(new Map());
    setSelectedElement(null);
    setPreviewReloadNonce(n => n + 1);
  }, []);

  // (c) Guarda de salida: si hay cambios sin guardar, interponer el diálogo
  // Guardar / Descartar antes de ejecutar `proceed`; si no, seguir directo.
  const guardUnsaved = useCallback((proceed: () => void) => {
    if (pendingEditsRef.current.size > 0) {
      setPendingNavAction({ proceed });
    } else {
      proceed();
    }
  }, []);

  const handleApplyClassName = useCallback(
    (newClassName: string) => stageVisualEdit({ className: newClassName }, { classNameMode: 'replace' }),
    [stageVisualEdit],
  );

  const handleApplyText = useCallback(
    (newText: string) => stageVisualEdit({ textContent: newText }),
    [stageVisualEdit],
  );

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

    // Persistencia del mensaje del usuario: embudo común de TODOS los envíos.
    // El input del chat, el mensaje inyectado y el initialPrompt (que entra por
    // aquí directamente, sin pasar por ChatInterface) confluyen en esta función,
    // así que persistir aquí garantiza que el PRIMER prompt del proyecto quede en
    // el historial. project_id (projectId) y user_id (resuelto dentro de
    // persistMessage vía auth.getUser) están disponibles en este punto: el flujo
    // del initialPrompt corre post-auth y post-carga del proyecto. Fire-and-forget
    // como el resto — persistChatMessage ya suprime modo lectura y falta de
    // projectId, y el servicio traga sus propios errores.
    persistChatMessage('user', message);

    setIsGenerating(true);
    setGenerationProgress(null);
    // Label del snapshot: la PRIMERA generación de un proyecto (aún sin build
    // propio) se marca como "Proyecto creado"; el resto de intents (plan/simple/
    // fixes) llevan el prompt del usuario. Capturamos el flag antes de cualquier
    // await para que el compile exitoso que pone hasBuiltProject=true no lo mueva.
    const isInitialGeneration = !hasBuiltProject;
    // CAMBIO 4 — una nueva generación supersede cualquier overlay de cancelación
    // previo: el overlay "Generando…" toma el relevo y, si esta corrida completa,
    // el estado cancelado no debe reaparecer.
    setCancelledInfo(null);

    // CAMBIO 2 — un AbortController nuevo por run; su signal se propaga a todo el
    // pipeline. El botón Cancelar del chat lo aborta.
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsCancelling(false);

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
        chatHistory.slice(-10).map(({ role, content }) => ({ role, content })),
        abortController.signal
      );
      if (result.modifiedFiles.length > 0) {
        const promptLabel = truncateLabel(message, 80);
        const snapshotLabel = isInitialGeneration
          ? `Proyecto creado: ${promptLabel}`
          : promptLabel;
        await saveSnapshot('ai_action', snapshotLabel);
      }

      const cancelled = result.outcome === 'cancelled';
      // Cancelado cuenta como no-fallo: se preservó lo completado y el mensaje
      // honesto viaja en chatResponse.
      const success = result.outcome !== 'failed';
      // CAMBIO 2/4: una cancelación NO es una construcción completa. No marcamos
      // awaitingFirstBuildCompile (que bajaría el overlay de generación y dejaría
      // que el compile del template a medias marcara hasBuiltProject=true,
      // ocultando el estado engañoso). Sólo una corrida no cancelada lo hace.
      if (success && !cancelled && result.modifiedFiles.length > 0 && !hasBuiltProject) {
        setAwaitingFirstBuildCompile(true);
      }
      if (cancelled) {
        // CAMBIO 4 — sostener el overlay honesto post-cancelación.
        setCancelledInfo({ count: result.modifiedFiles.length });
        terminalRef.current?.write(
          `\r\n\x1b[33m⏹ Generación cancelada — ${result.modifiedFiles.length} archivo(s) conservado(s).\x1b[0m\r\n`
        );
      } else if (success) {
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
      // CAMBIO 2 — última red de seguridad de la ruta de cancelación: una
      // cancelación que se propagó como throw (p. ej. abortada durante la
      // clasificación/planificación, antes de que ningún lane la capturara) NO
      // debe cerrar por la ruta de fallo ("Failed after 3 retries"). La tratamos
      // como cancelación honesta: en ese punto no se persistió ningún archivo.
      if (isAbortError(error) || abortController.signal.aborted) {
        setCancelledInfo({ count: 0 });
        terminalRef.current?.write('\r\n\x1b[33m⏹ Generación cancelada.\x1b[0m\r\n');
        return {
          success: true,
          modifiedFiles: [],
          chatResponse: 'Generación cancelada — se conservaron 0 archivos.',
        };
      }
      console.error('[StudioEngine] Error processing message:', error);
      terminalRef.current?.write('\r\n\x1b[31m❌ Unexpected error.\x1b[0m\r\n');
      return { success: false, modifiedFiles: [] };
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
      // CAMBIO 2 — cierre del run: soltamos el controller y rehabilitamos el botón.
      abortControllerRef.current = null;
      setIsCancelling(false);
    }
  };

  // CAMBIO 2 — cancelar la generación en curso. Un solo click (sin modal); el
  // botón se deshabilita durante el cierre para evitar dobles cancelaciones. El
  // AbortController aborta todas las llamadas fetch del run; el orchestrator
  // conserva lo completado y devuelve el mensaje honesto.
  const handleCancelGeneration = useCallback(() => {
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    setIsCancelling(true);
    terminalRef.current?.write('\r\n\x1b[33m⏹ Cancelando…\x1b[0m\r\n');
    controller.abort();
  }, []);

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
  const fileTree = mapToFileSystemTree(files); // for legacy components (StateGraph, SettingsModal, HistoryDrawer)
  const hasPreview = hasValidPreview;
  // CAMBIO 1 — número de cambios visuales pendientes de guardar (oid::propiedad).
  const pendingCount = pendingEdits.size;

  // CAMBIO 3 (pasajero) — overlay sin flash. Antes el overlay solo aparecía
  // cuando isGenerating pasaba a true, dejando una ventana de 1-2s donde el
  // iframe pintaba el scaffold crudo. Ahora, si el proyecto llegó con un
  // initialPrompt pendiente de disparar, el overlay se muestra DESDE EL MONTAJE
  // (awaitingInitialGeneration) y cae con el primer compile, como hoy.
  //
  // Overlay de generación. Solo en la PRIMERA construcción (sin bundle propio
  // todavía): mientras la generación corre, esperamos su primer compile, o hay
  // una generación inicial pendiente de arrancar.
  const showGeneratingOverlay =
    !hasBuiltProject && (isGenerating || awaitingFirstBuildCompile || awaitingInitialGeneration);

  // CAMBIO 4 — overlay honesto post-cancelación. Sólo cuando hay un cierre
  // cancelado registrado, no hay build completo todavía (hasBuiltProject=false)
  // y no está corriendo una generación (el overlay "Generando…" tiene prioridad).
  // Cae solo cuando hasBuiltProject pasa a true con el primer compile de una
  // generación posterior.
  const showCancelledOverlay =
    !!cancelledInfo && !hasBuiltProject && !showGeneratingOverlay;

  // CAMBIO 4 — prompt de "Completar proyecto": viaja por el flujo normal del chat.
  const COMPLETE_PROJECT_PROMPT =
    'Completa el proyecto: conserva los componentes existentes y genera las secciones y páginas que faltan.';
  const handleCompleteProject = useCallback(() => {
    setActiveBottomTab('chat');
    setIsCommandModalOpen(true);
    setPendingChatSend(COMPLETE_PROJECT_PROMPT);
  }, [COMPLETE_PROJECT_PROMPT]);

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
      const { message, filename, lineno, componentName, componentStack, stack, source } = event.data;
      const where = componentName || filename || 'el preview';
      // CAMBIO 1d — cuando el error llega de la evaluación top-level del módulo
      // (antes de que React monte), el código falló al CARGAR: el mensaje del
      // chat lo dice así en vez de nombrar un componente inexistente. El prompt
      // del fix dirigido funciona igual con ambos (stack + archivo).
      const isModuleEval = source === 'module-evaluation';

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

      // CAMBIO 1 — fix dirigido con contexto automático. El prompt se enriquece
      // con el archivo implicado (resuelto vía component_registry / fallback por
      // nombre) + sus imports directos e instrucción de fix mínimo. La
      // construcción es async (lee la project memory); si no resuelve el archivo,
      // el helper degrada solo a error+stack. El mensaje del chat se añade dentro
      // del async para llevar ya el prompt final.
      const errorInfo = { message, filename, lineno, componentName, componentStack, stack };
      void (async () => {
        let memory = null;
        try {
          memory = projectId ? await ProjectMemoryService.get(projectId) : null;
        } catch {
          // memory no disponible → el helper degrada al comportamiento actual.
        }
        const fixPrompt = AIOrchestrator.buildRuntimeErrorFixPrompt(
          errorInfo,
          filesRef.current,
          memory
        );

        const runtimeErrorContent = isModuleEval
          ? `⚠ El código falló al cargar: ${message ?? 'error desconocido'}`
          : `⚠ Error de runtime en el preview: ${message ?? 'error desconocido'} en ${where}`;
        setChatHistory(prev => [
          ...prev,
          {
            role: 'assistant',
            content: runtimeErrorContent,
            actionLabel: 'Corregir con AI',
            suggestedAction: fixPrompt,
          } as Message,
        ].slice(-30));
        // Mensaje de sistema visible (error de runtime) → definitivo, se
        // persiste. No guardamos suggestedAction/actionLabel: sólo el contenido
        // visible; el botón "Corregir con AI" es efímero de esta sesión.
        persistChatMessage('assistant', runtimeErrorContent);
      })();
    };
    window.addEventListener('message', handleRuntimeError);
    return () => window.removeEventListener('message', handleRuntimeError);
  }, [projectId]);

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
      runExclusive(async () => {
        try {
          const { html, oidMap, verdict } = await compileWithMeta(filesRef.current);
          if (Object.keys(oidMap).length > 0) oidMapRef.current = oidMap;
          // Un reintento manual sí pinta el resultado, sea cual sea (incluida la
          // página "servidor ocupado"), para dar feedback honesto al usuario.
          applyPreviewHtml(html);
          void verdict;
        } catch (e) {
          console.error('[StudioEngine] retry compile error:', e);
        } finally {
          setIsCompiling(false);
        }
      });
    };
    window.addEventListener('message', handleRetryCompile);
    return () => window.removeEventListener('message', handleRetryCompile);
  }, [files, runExclusive, applyPreviewHtml]);

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
                    onClick={() => guardUnsaved(() => { setIsMenuPanelOpen(false); navigate('/'); })}
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
                  {/* Edit mode toolbar. z-50 keeps the Interaction/Visual toggle
                      above the property panel (z-40) — previously the visual-mode
                      overlay glass pane sat on top of it and swallowed the click. */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg flex overflow-hidden shadow-lg">
                    <button
                      onClick={() => guardUnsaved(() => setEditMode('interaction'))}
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
                        key={`preview-${previewReloadNonce}`}
                        ref={iframeRef}
                        srcDoc={compiledHtml}
                        sandbox="allow-scripts allow-modals"
                        className="w-full h-full border-none"
                        title="Preview"
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
                          key={`preview-${previewReloadNonce}`}
                          ref={iframeRef}
                          srcDoc={compiledHtml}
                          sandbox="allow-scripts allow-modals"
                          className="w-full h-full border border-zinc-600 rounded-t-lg"
                          title="Preview"
                        />
                      </div>
                    </div>
                  )}

                  {/* PR-2 — deterministic property panel (the heart). Shown when a
                      source element is selected in visual mode. */}
                  {editMode === 'visual' && selectedElement && (
                    <PropertyPanel
                      key={`${selectedElement.filePath}:${selectedElement.ordinal}`}
                      element={selectedElement}
                      projectCss={files.get('src/index.css') ?? ''}
                      onApplyClassName={handleApplyClassName}
                      onApplyText={handleApplyText}
                      onClose={() => {
                        iframeRef.current?.contentWindow?.postMessage({ type: 'clear-selection' }, '*');
                        setSelectedElement(null);
                      }}
                    />
                  )}

                  {/* CAMBIO 1 (b) — barra de guardado explícito. Visible en modo
                      Visual siempre que haya cambios pendientes, aunque no haya
                      ningún elemento seleccionado. "Guardar cambios (N)" aplica
                      todo el buffer a la fuente y compila una vez; "Descartar"
                      recarga el preview desde el último estado compilado. */}
                  {editMode === 'visual' && pendingCount > 0 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-card border border-border rounded-full shadow-2xl px-2 py-1.5">
                      <span className="text-xs text-muted-foreground pl-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {pendingCount} cambio{pendingCount === 1 ? '' : 's'} sin guardar
                      </span>
                      <button
                        onClick={() => discardVisualChanges()}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-accent transition-colors"
                      >
                        Descartar
                      </button>
                      <button
                        onClick={() => { void saveVisualChanges(); }}
                        className="text-xs font-medium bg-primary text-white px-4 py-1.5 rounded-full hover:bg-primary/90 transition-colors"
                      >
                        Guardar cambios ({pendingCount})
                      </button>
                    </div>
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
                  {/* CAMBIO 3 — botón Cancelar en el overlay de generación. Mismo
                      handler (handleCancelGeneration) y confirmación de un click
                      que el del chat; deshabilitado durante el cierre. */}
                  {isGenerating && (
                    <button
                      onClick={handleCancelGeneration}
                      disabled={isCancelling}
                      title="Cancelar generación"
                      className="mt-2 flex items-center gap-1.5 bg-destructive/90 text-white px-4 py-2 rounded-md hover:bg-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {isCancelling
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <XIcon className="w-4 h-4" />}
                      <span>{isCancelling ? 'Cancelando…' : 'Cancelar'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* CAMBIO 4 — overlay honesto tras cancelar: en vez de dejar ver la
                  navbar generada sobre el template crudo, se informa cuántos
                  componentes se conservaron y se ofrece completar el proyecto por
                  el flujo normal del chat. Cae con el primer compile de una
                  generación posterior (hasBuiltProject → true). */}
              {showCancelledOverlay && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
                  <div className="text-sm font-medium text-foreground">
                    Generación cancelada — {cancelledInfo!.count} componente{cancelledInfo!.count === 1 ? '' : 's'} conservado{cancelledInfo!.count === 1 ? '' : 's'}
                  </div>
                  <div className="text-xs text-muted-foreground max-w-[80%]">
                    Se conservó lo que ya se había generado. Puedes completar el resto cuando quieras.
                  </div>
                  <button
                    onClick={handleCompleteProject}
                    className="mt-1 flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm"
                  >
                    <Flame className="w-4 h-4" />
                    <span>Completar proyecto</span>
                  </button>
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
            onToggleVisualEdit={(active) => {
              if (active) setEditMode('visual');
              else guardUnsaved(() => setEditMode('interaction'));
            }}
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
                  onPersistMessage={persistChatMessage}
                  onCancel={handleCancelGeneration}
                  isCancelling={isCancelling}
                  injectedMessage={pendingChatSend}
                  onInjectedConsumed={() => setPendingChatSend(null)}
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
                  beforeNavigate={guardUnsaved}
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
          onRestore={handleRestoreSnapshot}
          currentTree={fileTree}
        />

        {/* CAMBIO 1 (c) — diálogo de cambios sin guardar. Se interpone al salir
            de Visual, del proyecto o al cambiar de página con edits pendientes.
            Guardar aplica el buffer y continúa; Descartar recarga el preview y
            continúa; Cancelar cierra el diálogo y no hace nada. */}
        {pendingNavAction && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60">
            <div className="w-[92%] max-w-md rounded-xl border border-border bg-card shadow-2xl text-foreground p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">Tienes cambios sin guardar</h3>
                <p className="text-sm text-muted-foreground">
                  {pendingCount} cambio{pendingCount === 1 ? '' : 's'} visual{pendingCount === 1 ? '' : 'es'} sin guardar. ¿Qué quieres hacer antes de continuar?
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setPendingNavAction(null)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground px-4 py-2 rounded-md hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const action = pendingNavAction;
                    setPendingNavAction(null);
                    discardVisualChanges();
                    action.proceed();
                  }}
                  className="text-sm font-medium border border-border text-foreground px-4 py-2 rounded-md hover:bg-accent transition-colors"
                >
                  Descartar
                </button>
                <button
                  onClick={() => {
                    const action = pendingNavAction;
                    setPendingNavAction(null);
                    void saveVisualChanges().then(() => action.proceed());
                  }}
                  className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
