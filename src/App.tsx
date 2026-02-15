import { useEffect, useState, useRef } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { useWebContainer } from './hooks/useWebContainer';
import { useHistory } from './hooks/useHistory';
import { files } from './files';
import './App.css';
import { ChatInterface } from './components/ChatInterface';
import { PreviewOverlay } from './components/PreviewOverlay';
import { InspectorPanel } from './components/InspectorPanel';
import { Terminal, type TerminalRef } from './components/Terminal';
import { FileExplorer } from './components/FileExplorer';
import { AIOrchestrator } from './services/AIOrchestrator';
import type { FileSystemTree } from '@webcontainer/api';
import { webContainerService } from './services/WebContainerService';
import { updateCode, type TargetElement } from './utils/ast';
import JSZip from 'jszip';
import { Download, Upload, Loader2, LayoutTemplate, Undo, Redo, RefreshCw } from 'lucide-react'; // Added RefreshCw
import { TEMPLATES } from './templates';

function App() {
  const { container, uploadZip, isLoading: isContainerLoading, installDependency } = useWebContainer();
  const [url, setUrl] = useState('');
  const history = useHistory<FileSystemTree>(files);
  const fileTree = history.state;
  const [showTemplateSelector, setShowTemplateSelector] = useState(true);
  const [selectedElement, setSelectedElement] = useState<TargetElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState<'interaction' | 'visual' | 'code'>('interaction');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [activeBottomTab, setActiveBottomTab] = useState<'chat' | 'terminal'>('chat');

  // We keep track of the active file for AST updates (Inspector)
  // Assuming single-page app or main file is src/App.tsx for now
  const activeFilePath = 'src/App.tsx';

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<TerminalRef>(null);

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
      await webContainerService.mount(newTree);
    }
  };

  const handleElementSelect = (element: { tagName: string; className?: string }) => {
    setSelectedElement(element);
  };

  const handleClassUpdate = async (newClassName: string) => {
    if (!selectedElement) return;

    const code = getFileContent(fileTree, activeFilePath);
    if (!code) {
        console.warn(`Could not find active file: ${activeFilePath}`);
        return;
    }

    const newCode = updateCode(code, selectedElement, { className: newClassName });
    const newTree = updateFileContent(fileTree, activeFilePath, newCode);

    history.set(newTree);
    if (container) {
      await webContainerService.mount(newTree);
    }

    // Update local selection state so the inspector reflects the change immediately
    setSelectedElement(prev => prev ? { ...prev, className: newClassName } : null);
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
      await webContainerService.mount(newTree);
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
        webContainerService.mount(fileTree).catch(console.error);
    }
  }, [fileTree, container]);

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
  };

  const handleLoadTemplate = async (templateKey: string) => {
      const template = TEMPLATES[templateKey];
      if (!template) return;

      history.set(template);
      setShowTemplateSelector(false);

      if (container) {
          await webContainerService.mount(template);
          triggerBuild();
      }
  };

  const triggerBuild = async (force: boolean = false) => {
      if (!container) return;
      setActiveBottomTab('terminal');

      try {
        let shouldInstall = force;
        if (!shouldInstall) {
            try {
                await container.fs.readdir('node_modules');
                console.log('node_modules exists, skipping install');
                terminalRef.current?.write('Skipping npm install (node_modules exists)...\r\n');
            } catch (error) {
                shouldInstall = true;
            }
        }

        if (shouldInstall) {
            // Install
            const installProcess = await container.spawn('npm', ['install']);
            installProcess.output.pipeTo(new WritableStream({
                write(data) {
                    console.log('[install]', data);
                    terminalRef.current?.write(data);
                }
            }));
            await installProcess.exit;
        }

        // Start Dev Server
        // We probably should kill existing server if running, but for now assuming one instance.
        // WebContainer might handle port conflict or multiple spawns automatically, but usually we need to be careful.
        // The previous code didn't kill it. I'll stick to existing pattern for now.
        const startProcess = await container.spawn('npm', ['run', 'dev']);
        startProcess.output.pipeTo(new WritableStream({
            write(data) {
                console.log('[run dev]', data);
                terminalRef.current?.write(data);
            }
        }));
      } catch (err) {
        console.error('Build failed', err);
        terminalRef.current?.write(`\r\nBuild failed: ${err}\r\n`);
      }
  };

  const handleInstallPackage = async (packageName: string) => {
      setActiveBottomTab('terminal');
      await installDependency(packageName, (data) => {
          terminalRef.current?.write(data);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white overflow-hidden">
      <Group orientation="vertical">
        {/* Top Section (70%) */}
        <Panel defaultSize={70} minSize={30}>
          <div className="relative w-full h-full bg-white">
             {/* Undo/Redo Controls - Moved to Top Left */}
             <div className="absolute top-4 left-4 z-50 bg-gray-900/90 rounded-full p-1 shadow-lg flex items-center border border-gray-700 gap-1">
                 <button
                    onClick={handleUndo}
                    disabled={!history.canUndo}
                    className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-full hover:bg-gray-800"
                    title="Undo (Ctrl+Z)"
                 >
                     <Undo size={14} />
                 </button>
                 <button
                    onClick={handleRedo}
                    disabled={!history.canRedo}
                    className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-full hover:bg-gray-800"
                    title="Redo (Ctrl+Shift+Z)"
                 >
                     <Redo size={14} />
                 </button>
             </div>

             {/* Main Content Area */}
             {editMode === 'code' ? (
                <div className="flex w-full h-full bg-gray-900">
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
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
                // Existing Preview Logic
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
                    />
                    {editMode === 'visual' && selectedElement && (
                        <InspectorPanel selectedElement={selectedElement} onUpdateStyle={handleClassUpdate} />
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
                                          className="flex flex-col items-center p-6 bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-xl transition-all group text-left"
                                      >
                                          <div className="p-3 rounded-full bg-blue-900/30 text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                                              <LayoutTemplate className="w-8 h-8" />
                                          </div>
                                          <h3 className="text-lg font-semibold text-gray-200 mb-1">Landing Page</h3>
                                          <p className="text-sm text-gray-500 text-center">Modern hero section with features grid and responsive navbar.</p>
                                      </button>

                                      <button
                                          onClick={() => handleLoadTemplate('dashboard')}
                                          className="flex flex-col items-center p-6 bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-xl transition-all group text-left"
                                      >
                                          <div className="p-3 rounded-full bg-purple-900/30 text-purple-400 mb-4 group-hover:scale-110 transition-transform">
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

        <Separator className="h-1 bg-gray-800 hover:bg-blue-500 transition-colors cursor-row-resize" />

        {/* Bottom Section (30%) */}
        <Panel defaultSize={30} minSize={10}>
             <div className="flex h-full w-full bg-gray-900">
                {/* Left: Upload/Export (20%) */}
                <div className="w-[20%] p-4 border-r border-gray-800 flex flex-col gap-4">
                    <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-700 rounded-lg hover:border-blue-500 hover:bg-gray-800 transition-all cursor-pointer group">
                        <Upload className="w-6 h-6 text-gray-400 group-hover:text-blue-500 mb-2" />
                        <span className="text-sm text-gray-400 group-hover:text-blue-400">Upload Zip</span>
                        <input type="file" accept=".zip" onChange={handleUploadZip} className="hidden" />
                    </label>

                    <button
                        onClick={downloadProject}
                        className="flex items-center justify-center gap-2 w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
                    >
                        <Download className="w-4 h-4" />
                        Export Zip
                    </button>
                </div>

                {/* Right: Chat (80%) */}
                <div className="flex-1 h-full relative">
                    <div className="absolute top-2 right-2 flex bg-gray-900 rounded-lg p-1 z-10 border border-gray-700">
                        <button
                            onClick={() => setActiveBottomTab('chat')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeBottomTab === 'chat' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Chat
                        </button>
                        <button
                            onClick={() => setActiveBottomTab('terminal')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeBottomTab === 'terminal' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Terminal
                        </button>
                    </div>

                    <div className={`w-full h-full ${activeBottomTab === 'chat' ? 'block' : 'hidden'}`}>
                        <ChatInterface
                            isLoading={isGenerating}
                            onSendMessage={handleSendMessage}
                            selectedElement={selectedElement}
                            editMode={editMode}
                            setEditMode={setEditMode}
                        />
                    </div>
                    <div className={`w-full h-full ${activeBottomTab === 'terminal' ? 'block' : 'hidden'}`}>
                        <Terminal ref={terminalRef} />
                    </div>
                </div>
             </div>
        </Panel>
      </Group>
    </div>
  );
}

export default App;
