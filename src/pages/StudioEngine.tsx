/**
 * StudioEngine — the full Wyrd Forge AI web-builder IDE.
 *
 * This component was extracted from src/App.tsx so that it can be mounted
 * under /studio via React Router while keeping the routing entry-point
 * (App.tsx) thin. All original state, hooks, and context wrappers are
 * preserved exactly as they were.
 */
import { useEffect, useState, useRef } from 'react';
import { Panel, Group } from 'react-resizable-panels';
import { useWebContainer } from '../hooks/useWebContainer';
import { useHistory } from '../hooks/useHistory';
import { files } from '../files';
import '../App.css';
import { ChatInterface } from '../components/ChatInterface';
import { PreviewOverlay } from '../components/PreviewOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { FileExplorer } from '../components/FileExplorer';
import { AIOrchestrator } from '../services/AIOrchestrator';
import type { FileSystemTree } from '@webcontainer/api';
import { webContainerService } from '../services/WebContainerService';
import { updateCode, updateJSXProp, type TargetElement } from '../utils/ast';
import JSZip from 'jszip';
import {
  Download,
  Upload,
  Loader2,
  LayoutTemplate,
  RefreshCw,
  Settings,
  Activity,
  Menu,
  X,
} from 'lucide-react';
import { TEMPLATES } from '../templates';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { SettingsModal } from '../components/settings/SettingsModal';
import { StateGraph } from '../components/debug/StateGraph';
import { CommandBubble } from '../components/CommandBubble';
import { CommandModal } from '../components/CommandModal';

type TabType = 'chat' | 'visual' | 'code';

export function StudioEngine() {
  const { container, uploadZip, isLoading: isContainerLoading, installDependency, mountFileTree } = useWebContainer();
  const [url, setUrl] = useState('');
  const history = useHistory<FileSystemTree>(files);
  const fileTree = history.state;
  const [showTemplateSelector, setShowTemplateSelector] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showHamburger, setShowHamburger] = useState(false);
  const [selectedElement, setSelectedElement] = useState<TargetElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState<'interaction' | 'visual' | 'code'>('interaction');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [activeBottomTab, setActiveBottomTab] = useState<TabType>('chat');
  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);

  const uploadZipRef = useRef<HTMLInputElement>(null);

  // We keep track of the active file for AST updates (Inspector)
  // Assuming single-page app or main file is src/App.tsx for now
  const activeFilePath = 'src/App.tsx';

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Helper to get content from tree
  const getFileContent = (tree: FileSystemTree, path: string): string | null => {
    const parts = path.split('/');
    let current: any = tree;
    for (const part of parts) {
      if (!current) return null;
      if (current[part]) {
        current = current[part];
      } else if (current.directory && current.directory[part]) {
        current = current.directory[part];
      } else {
        return null;
      }
    }
    if (current && current.file && 'contents' in current.file) {
      return typeof current.file.contents === 'string'
        ? current.file.contents
        : new TextDecoder().decode(current.file.contents);
    }
    return null;
  };

  // Helper to update content in tree
  const updateFileContent = (tree: FileSystemTree, path: string, content: string): FileSystemTree => {
    const newTree = JSON.parse(JSON.stringify(tree));
    const parts = path.split('/');
    let current: any = newTree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (current[part] && 'file' in current[part]) {
           current[part].file.contents = content;
        } else {
             current[part] = { file: { contents: content } };
        }
      } else {
        if (current[part]) {
             if ('directory' in current[part]) {
                 current = current[part].directory;
             } else {
                 return newTree;
             }
        } else if (current.directory && current.directory[part]) {
            current = current.directory[part];
        } else {
             current[part] = { directory: {} };
             current = current[part].directory;
        }
      }
    }
    return newTree;
  };

  const handleFileSelect = (path: string) => {
    setSelectedFilePath(path);
    const content = getFileContent(fileTree, path);
    setSelectedFileContent(content || '');
  };

  const handleCodeEdit = (newContent: string) => {
    setSelectedFileContent(newContent);
  };

  const saveAndRun = async () => {
    if (!selectedFilePath) return;
    const newTree = updateFileContent(fileTree, selectedFilePath, selectedFileContent);
    history.set(newTree);
    if (container) {
      await mountFileTree(newTree);
    }
  };

  const handleElementSelect = (element: { tagName: string; className?: string; innerText?: string; hasChildren?: boolean; dataOid?: string }) => {
    setSelectedElement(element);
  };

  const handleTextUpdate = async (newText: string) => {
    if (!selectedElement) return;

    const code = getFileContent(fileTree, activeFilePath);
    if (!code) {
        console.warn(`Could not find active file: ${activeFilePath}`);
        return;
    }

    const newCode = updateCode(code, selectedElement, { textContent: newText });
    const newTree = updateFileContent(fileTree, activeFilePath, newCode);

    history.set(newTree);
    if (container) {
      await mountFileTree(newTree);
    }
  };

  const handleClassUpdate = async (newClassName: string) => {
    if (!selectedElement) return;

    const code = getFileContent(fileTree, activeFilePath);
    if (!code) {
        console.warn(`Could not find active file: ${activeFilePath}`);
        return;
    }

    const newCode = updateCode(code, selectedElement, { className: newClassName }, { classNameMode: 'replace' });
    const newTree = updateFileContent(fileTree, activeFilePath, newCode);

    history.set(newTree);
    if (container) {
      await mountFileTree(newTree);
    }

    // Update local selection state so the inspector reflects the change immediately
    setSelectedElement(prev => prev ? { ...prev, className: newClassName } : null);
  };

  const handlePropUpdate = async (name: string, value: string | boolean | number) => {
    if (!selectedElement) return;

    const code = getFileContent(fileTree, activeFilePath);
    if (!code) {
        console.warn(`Could not find active file: ${activeFilePath}`);
        return;
    }

    const newCode = updateJSXProp(code, selectedElement, name, value);
    const newTree = updateFileContent(fileTree, activeFilePath, newCode);

    history.set(newTree);
    if (container) {
      await mountFileTree(newTree);
    }
  };

  const handleStyleUpdate = async (newStyles: Record<string, string>) => {
      if (!selectedElement) return;

      let currentClass = selectedElement.className || '';
      const newClassSegment = Object.values(newStyles).join(' ');

      if (newStyles.transform) {
          // Remove existing translate classes to avoid buildup
          currentClass = currentClass.replace(/\btranslate-[xy]-[^\s]+\s?/g, '');
      }
      if (newStyles.dimensions) {
          // Remove existing width/height classes
          currentClass = currentClass.replace(/\bw-[^\s]+\s?/g, '').replace(/\bh-[^\s]+\s?/g, '');
      }

      const finalClass = `${currentClass} ${newClassSegment}`.trim();

      await handleClassUpdate(finalClass);
  };

  const handleCodeUpdate = async (newTree: FileSystemTree) => {
    history.set(newTree);
    if (container) {
      await mountFileTree(newTree);
    }
  };

  const handleUndo = async () => {
    if (history.canUndo) {
        history.undo();
    }
  };

  const handleRedo = async () => {
      if (history.canRedo) {
          history.redo();
      }
  };

  useEffect(() => {
    const prompt = sessionStorage.getItem('studio_initial_prompt');
    if (prompt) {
      sessionStorage.removeItem('studio_initial_prompt');
      // Wait for WebContainer to be ready before sending
      const timer = setTimeout(() => {
        if (!isContainerLoading) {
          handleSendMessage(prompt);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history]);

  useEffect(() => {
    if (container && fileTree && Object.keys(fileTree).length > 0) {
        mountFileTree(fileTree).catch(console.error);
    }
  }, [fileTree, container]);

  useEffect(() => {
    // Load secrets on mount
    const stored = localStorage.getItem('secrets');
    if (stored) {
      try {
        const secrets = JSON.parse(stored);
        const env: Record<string, string> = {};
        secrets.forEach((s: any) => {
          if (s.key) env[s.key] = s.value;
        });
        webContainerService.setEnv(env);
      } catch (e) {
        console.error('Failed to load secrets', e);
      }
    }
  }, []);

  const handleSendMessage = async (message: string) => {
    setIsGenerating(true);
    try {
      const result = await AIOrchestrator.parseUserCommand(message, fileTree, selectedElement);
      if (result) {
        await handleCodeUpdate(result);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error processing message:', error);
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       const tree = await uploadZip(e.target.files[0]);
       if (tree) {
           history.set(tree);
           setShowTemplateSelector(false);
           triggerBuild();
       }
    }
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  const handleLoadTemplate = async (templateKey: string) => {
      const template = TEMPLATES[templateKey];
      if (!template) return;

      setShowTemplateSelector(false);

      if (container) {
          const treeWithIds = await mountFileTree(template);
          if (treeWithIds) {
              history.set(treeWithIds);
          } else {
              history.set(template);
          }
          triggerBuild();
      } else {
          history.set(template);
      }
  };

  const triggerBuild = async (force: boolean = false) => {
      if (!container) return;

      try {
        console.log('[build] Configuring Shadcn/UI...');
        await webContainerService.configureShadcn();

        let shouldInstall = force;
        if (!shouldInstall) {
            try {
                await container.fs.readdir('node_modules');
                console.log('[build] node_modules exists, skipping install');
            } catch {
                shouldInstall = true;
            }
        }

        if (shouldInstall) {
            const env = webContainerService.getEnv();
            const installProcess = await container.spawn('npm', ['install'], { env });
            installProcess.output.pipeTo(new WritableStream({
                write(data) { console.log('[install]', data); }
            }));
            await installProcess.exit;
        }

        // Start Dev Server
        const env = webContainerService.getEnv();
        const startProcess = await container.spawn('npm', ['run', 'dev'], { env });
        startProcess.output.pipeTo(new WritableStream({
            write(data) { console.log('[run dev]', data); }
        }));
      } catch (err) {
        console.error('[build] Build failed', err);
      }
  };

  const handleInstallPackage = async (packageName: string) => {
      await installDependency(packageName, (data) => {
          console.log('[install]', data);
      });
  };

  useEffect(() => {
    if (container) {
         container.on('server-ready', (_port, url) => {
            console.log('Server ready:', url);
            setUrl(url);
          });
    }
  }, [container]);

  // Download logic
  const downloadProject = async () => {
    const zip = new JSZip();
    const addFilesToZip = (tree: FileSystemTree, currentPath: string) => {
      for (const [name, node] of Object.entries(tree)) {
        if ('file' in node) {
          const file = node.file;
          if ('contents' in file) {
            const content = file.contents;
            zip.file(`${currentPath}${name}`, content);
          }
        } else if ('directory' in node) {
          addFilesToZip(node.directory, `${currentPath}${name}/`);
        }
      }
    };
    addFilesToZip(fileTree, '');
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

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen w-screen bg-gray-950 text-white overflow-hidden">
        <Group orientation="vertical">
          {/* Main Section */}
        <Panel defaultSize={100} minSize={30}>
          <div className="relative w-full h-full bg-gray-950">

            {/* Hamburger Menu — Top Left */}
            <div className="absolute top-4 left-4 z-50">
              <button
                onClick={() => setShowHamburger((v) => !v)}
                className="p-2 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-gray-400 hover:text-white transition-colors"
                title="Menu"
              >
                <Menu size={18} />
              </button>

              {showHamburger && (
                <>
                  {/* Backdrop to close on outside click */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowHamburger(false)}
                  />
                  <div className="absolute top-10 left-0 z-50 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden py-1">
                    {/* Upload Zip */}
                    <label className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white cursor-pointer transition-colors">
                      <Upload size={15} className="text-gray-400" />
                      Upload Zip
                      <input
                        type="file"
                        accept=".zip"
                        ref={uploadZipRef}
                        onChange={(e) => {
                          setShowHamburger(false);
                          handleUploadZip(e);
                        }}
                        className="hidden"
                      />
                    </label>

                    {/* Export Zip */}
                    <button
                      onClick={() => {
                        setShowHamburger(false);
                        downloadProject();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      <Download size={15} className="text-gray-400" />
                      Export Zip
                    </button>

                    <div className="my-1 h-px bg-gray-800" />

                    {/* Settings */}
                    <button
                      onClick={() => {
                        setShowHamburger(false);
                        setShowSettings(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      <Settings size={15} className="text-gray-400" />
                      Settings
                    </button>

                    {/* Visual Graph */}
                    <button
                      onClick={() => {
                        setShowHamburger(false);
                        setShowGraph(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      <Activity size={15} className="text-gray-400" />
                      Visual Graph
                    </button>

                    <div className="my-1 h-px bg-gray-800" />

                    {/* Undo / Redo — kept accessible in menu */}
                    <button
                      onClick={() => { setShowHamburger(false); handleUndo(); }}
                      disabled={!history.canUndo}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <X size={15} className="text-gray-400 rotate-45" />
                      Undo
                    </button>
                    <button
                      onClick={() => { setShowHamburger(false); handleRedo(); }}
                      disabled={!history.canRedo}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <X size={15} className="text-gray-400 -rotate-45" />
                      Redo
                    </button>
                  </div>
                </>
              )}
            </div>

             {/* Main Content Area */}
             {editMode === 'code' ? (
                <div className="flex w-full h-full bg-gray-950">
                   <div className="w-64 border-r border-gray-800 h-full overflow-hidden">
                      <FileExplorer
                          fileTree={fileTree}
                          onSelect={handleFileSelect}
                          onAddPackage={handleInstallPackage}
                      />
                   </div>
                   <div className="flex-1 flex flex-col h-full overflow-hidden">
                      <div className="h-10 border-b border-gray-800 flex items-center justify-between px-4 bg-gray-900 shrink-0">
                          <span className="text-sm text-gray-400">{selectedFilePath || 'No file selected'}</span>
                          <div className="flex gap-2">
                              <button
                                  onClick={() => triggerBuild(true)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded disabled:opacity-50 flex items-center gap-1"
                                  title="Force Reinstall Dependencies"
                              >
                                  <RefreshCw size={12} />
                                  Reinstall
                              </button>
                              <button
                                  onClick={saveAndRun}
                                  disabled={!selectedFilePath}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                  Save & Run
                              </button>
                          </div>
                      </div>
                      <textarea
                          value={selectedFileContent}
                          onChange={(e) => handleCodeEdit(e.target.value)}
                          className="flex-1 w-full bg-gray-950 text-gray-300 p-4 font-mono text-sm resize-none focus:outline-none"
                          spellCheck={false}
                          disabled={!selectedFilePath}
                      />
                   </div>
                </div>
             ) : (
                // Preview Logic
                url ? (
                  <>
                    <iframe
                      ref={iframeRef}
                      src={url}
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
                  </>
                ) : (
                   <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                     {isContainerLoading ? (
                          <>
                              <Loader2 className="animate-spin w-8 h-8" />
                              <div>Initializing WebContainer...</div>
                          </>
                     ) : (
                          showTemplateSelector && Object.keys(fileTree).length === 0 ? (
                              <div className="flex flex-col items-center gap-6 max-w-2xl w-full px-8">
                                  <div className="text-center">
                                      <h2 className="text-2xl font-bold text-gray-300 mb-2">Start a New Project</h2>
                                      <p className="text-gray-500">Choose a template to get started quickly or upload your own.</p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 w-full">
                                      <button
                                          onClick={() => handleLoadTemplate('landing-page')}
                                          className="flex flex-col items-center p-6 bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-xl transition-all group text-left"
                                      >
                                          <div className="p-3 rounded-full bg-red-900/30 text-red-400 mb-4 group-hover:scale-110 transition-transform">
                                              <LayoutTemplate className="w-8 h-8" />
                                          </div>
                                          <h3 className="text-lg font-semibold text-gray-200 mb-1">Landing Page</h3>
                                          <p className="text-sm text-gray-500 text-center">Modern hero section with features grid and responsive navbar.</p>
                                      </button>

                                      <button
                                          onClick={() => handleLoadTemplate('dashboard')}
                                          className="flex flex-col items-center p-6 bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-xl transition-all group text-left"
                                      >
                                          <div className="p-3 rounded-full bg-red-900/30 text-red-400 mb-4 group-hover:scale-110 transition-transform">
                                              <LayoutTemplate className="w-8 h-8" />
                                          </div>
                                          <h3 className="text-lg font-semibold text-gray-200 mb-1">Dashboard</h3>
                                          <p className="text-sm text-gray-500 text-center">Admin layout with sidebar, header, and stats cards.</p>
                                      </button>
                                  </div>

                                  <div className="relative w-full flex items-center gap-4 my-4">
                                      <div className="h-px bg-gray-800 flex-1"></div>
                                      <span className="text-xs text-gray-600 uppercase font-medium">Or</span>
                                      <div className="h-px bg-gray-800 flex-1"></div>
                                  </div>

                                  <label className="cursor-pointer text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                                      <Upload className="w-4 h-4" />
                                      Upload a .zip file
                                      <input type="file" accept=".zip" onChange={handleUploadZip} className="hidden" />
                                  </label>
                              </div>
                          ) : (
                            <div className="text-center">
                                <div className="mb-2">Ready to Code</div>
                                <div className="text-sm">Waiting for server...</div>
                            </div>
                          )
                     )}
                   </div>
                )
             )}
          </div>
        </Panel>

        </Group>

        <CommandBubble onClick={() => setIsCommandModalOpen(true)} />

        {isCommandModalOpen && (
          <CommandModal
            onClose={() => setIsCommandModalOpen(false)}
            visualEditMode={editMode === 'visual'}
            onToggleVisualEdit={(active) => setEditMode(active ? 'visual' : 'interaction')}
            activeTab={activeBottomTab}
            setActiveTab={(tab) => {
              setActiveBottomTab(tab);
              // Switching to code tab also activates code edit mode
              if (tab === 'code') setEditMode('code');
            }}
          >
             <div className="h-full w-full flex flex-col">
                <div className={`w-full h-full ${activeBottomTab === 'chat' ? 'block' : 'hidden'}`}>
                    <ChatInterface
                        isLoading={isGenerating}
                        onSendMessage={handleSendMessage}
                        selectedElement={selectedElement}
                    />
                </div>
                {/* Visual tab content is handled entirely inside CommandModal (toggle switch) */}
                <div className={`w-full h-full ${activeBottomTab === 'visual' ? 'block' : 'hidden'}`} />
                {/* Code tab — code editing happens in the main canvas area */}
                <div className={`w-full h-full flex items-center justify-center bg-gray-900 ${activeBottomTab === 'code' ? 'block' : 'hidden'}`}>
                  <p className="text-sm text-gray-500">Code editor is open in the canvas. Close this panel to use it.</p>
                </div>
             </div>
          </CommandModal>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} fileTree={fileTree} />}
        {showGraph && <StateGraph fileTree={fileTree} onClose={() => setShowGraph(false)} />}
      </div>
    </ProtectedRoute>
  );
}
