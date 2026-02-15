import { useEffect, useState, useRef } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';
import { useWebContainer } from './hooks/useWebContainer';
import { files } from './files';
import './App.css';
import { ChatInterface } from './components/ChatInterface';
import { PreviewOverlay } from './components/PreviewOverlay';
import { InspectorPanel } from './components/InspectorPanel';
import { FileExplorer } from './components/FileExplorer';
import { AIOrchestrator } from './services/AIOrchestrator';
import type { FileSystemTree } from '@webcontainer/api';
import { webContainerService } from './services/WebContainerService';
import { locateElement, updateCode, type TargetElement } from './utils/ast';
import JSZip from 'jszip';
import { Download } from 'lucide-react';

function App() {
  const { container } = useWebContainer();
  const [url, setUrl] = useState('');
  const [fileTree, setFileTree] = useState<FileSystemTree>(files);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [selectedElement, setSelectedElement] = useState<TargetElement | null>(null);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const initialized = useRef(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalOutput]);

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

  // Initial file load
  useEffect(() => {
    const initialPath = 'src/App.tsx';
    const content = getFileContent(fileTree, initialPath);
    if (content !== null) {
      setActiveFile({ path: initialPath, content });
    }
  }, []);

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
            // Should exist if we are editing it, but robust check
             current[part] = { file: { contents: content } };
        }
      } else {
        if (current[part]) {
             if ('directory' in current[part]) {
                 current = current[part].directory;
             } else {
                 // Error: path is a file but expected directory
                 return tree;
             }
        } else if (current.directory && current.directory[part]) {
            current = current.directory[part];
        } else {
            // Create directory if missing (simple assumption)
             current[part] = { directory: {} };
             current = current[part].directory;
        }
      }
    }
    return newTree;
  };

  const handleElementSelect = (element: TargetElement) => {
    setSelectedElement(element);

    // Simplification: Always try to inspect in src/App.tsx for this demo unless we track file origin of elements
    const path = 'src/App.tsx';
    const code = getFileContent(fileTree, path);

    if (code) {
        setActiveFile({ path, content: code });
        const location = locateElement(code, element);

        if (location && editorRef.current) {
            setTimeout(() => {
                if (editorRef.current) {
                    editorRef.current.revealLineInCenter(location.line);
                    editorRef.current.setPosition({ lineNumber: location.line, column: location.column + 1 });
                    editorRef.current.focus();
                }
            }, 50);
        }
    }
  };

  const handleClassUpdate = async (newClassName: string) => {
    if (!selectedElement) return;

    // Default to src/App.tsx for inspector updates
    const path = 'src/App.tsx';
    const code = getFileContent(fileTree, path);
    if (!code) return;

    const newCode = updateCode(code, selectedElement, { className: newClassName });

    const newTree = updateFileContent(fileTree, path, newCode);
    setFileTree(newTree);

    if (activeFile && activeFile.path === path) {
        setActiveFile({ ...activeFile, content: newCode });
    }

    if (container) {
      await webContainerService.mount(newTree);
    }

    setSelectedElement(prev => prev ? { ...prev, className: newClassName } : null);
  };

  const handleCodeUpdate = async (newTree: FileSystemTree) => {
    setFileTree(newTree);

    // Refresh active file content from new tree
    if (activeFile) {
        const newContent = getFileContent(newTree, activeFile.path);
        if (newContent !== null) {
            setActiveFile({ ...activeFile, content: newContent });
        }
    }

    if (container) {
      await webContainerService.mount(newTree);
    }
  };

  const handleSendMessage = async (message: string) => {
    setIsGenerating(true);
    try {
      const result = await AIOrchestrator.parseUserCommand(message, fileTree);
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

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !activeFile) return;

    setActiveFile(prev => prev ? { ...prev, content: value } : null);

    setFileTree(prev => {
      const newTree = updateFileContent(prev, activeFile.path, value);
      return newTree;
    });
  };

  useEffect(() => {
    if (!container || initialized.current) return;
    initialized.current = true;

    const start = async () => {
      // 1. Mount files
      await container.mount(fileTree);

      // 2. npm install
      const installProcess = await container.spawn('npm', ['install']);
      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          console.log('[install]', data);
          setTerminalOutput(prev => [...prev, data]);
        }
      }));

      const installExitCode = await installProcess.exit;
      if (installExitCode !== 0) {
        console.error('Installation failed');
        return;
      }

      // 3. Listen for server-ready
      container.on('server-ready', (_port, url) => {
        console.log('Server ready:', url);
        setUrl(url);
      });

      // 4. npm run dev
      const startProcess = await container.spawn('npm', ['run', 'dev']);
      startProcess.output.pipeTo(new WritableStream({
        write(data) {
          console.log('[run dev]', data);
          setTerminalOutput(prev => [...prev, data]);
        }
      }));
    };

    start();
  }, [container]);

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          WebContainer React App
        </h1>
        <button
          onClick={downloadProject}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-white"
        >
          <Download className="w-4 h-4" />
          Download Project
        </button>
      </header>
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="flex-1 h-full">
          <Panel defaultSize={20} minSize={15}>
            <Group orientation="vertical">
              <Panel defaultSize={40} minSize={20}>
                  <FileExplorer fileTree={fileTree} onSelectFile={(path, content) => setActiveFile({ path, content })} />
              </Panel>
              <Separator className="h-1 bg-gray-800 hover:bg-blue-500 transition-colors cursor-row-resize" />
              <Panel defaultSize={30} minSize={20}>
                <ChatInterface isLoading={isGenerating} onSendMessage={handleSendMessage} />
              </Panel>
              <Separator className="h-1 bg-gray-800 hover:bg-blue-500 transition-colors cursor-row-resize" />
              <Panel defaultSize={30} minSize={20}>
                <InspectorPanel selectedElement={selectedElement} onUpdateClass={handleClassUpdate} />
              </Panel>
            </Group>
          </Panel>
          <Separator className="w-1 bg-gray-800 hover:bg-blue-500 transition-colors cursor-col-resize" />
          <Panel defaultSize={40} minSize={20}>
            <Group orientation="vertical">
              <Panel defaultSize={70} minSize={20}>
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  path={activeFile?.path}
                  value={activeFile?.content || ''}
                  onChange={handleEditorChange}
                  onMount={(editor) => (editorRef.current = editor)}
                  theme="vs-dark"
                  options={{ minimap: { enabled: false } }}
                />
              </Panel>
              <Separator className="h-1 bg-gray-800 hover:bg-blue-500 transition-colors cursor-row-resize" />
              <Panel defaultSize={30} minSize={20}>
                <div className="h-full flex flex-col bg-black text-white p-2 overflow-hidden">
                  <div className="font-bold border-b border-gray-700 pb-1 mb-1">Terminal Output</div>
                  <div className="flex-1 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
                    {terminalOutput.map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </Panel>
            </Group>
          </Panel>
          <Separator className="w-1 bg-gray-800 hover:bg-blue-500 transition-colors cursor-col-resize" />
          <Panel defaultSize={40} minSize={20}>
            <div className="h-full w-full bg-white flex flex-col">
              <div className="h-10 px-4 bg-gray-100 border-b border-gray-300 flex items-center text-gray-700 text-sm flex-shrink-0">
                <span className="truncate">Preview {url ? `(${url})` : ''}</span>
              </div>
              <div className="flex-1 relative w-full">
                {url ? (
                  <>
                    <iframe
                      ref={iframeRef}
                      src={url}
                      className="w-full h-full border-none"
                      title="Preview"
                    />
                    <PreviewOverlay iframeRef={iframeRef} onElementSelect={handleElementSelect} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                    <div className="spinner"></div>
                    <div>Loading...</div>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}

export default App;
