import { useEffect, useState, useRef } from 'react';
import { WebContainer, type FileSystemTree } from '@webcontainer/api';
import { webContainerService } from '../services/WebContainerService';
import JSZip from 'jszip';
import { PREVIEW_CLIENT_SCRIPT } from '../utils/previewClient';
import { injectDataIds } from '../utils/ast';

export function useWebContainer() {
  const [container, setContainer] = useState<WebContainer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const bootStarted = useRef(false);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;

    const boot = async () => {
      try {
        await webContainerService.boot();
        const instance = webContainerService.getContainer();
        setContainer(instance);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error during WebContainer boot'));
        setIsLoading(false);
      }
    };

    boot();
  }, []);

  const mountFileTree = async (tree: FileSystemTree) => {
    if (!container) return;

    // Helper to traverse and inject IDs
    const injectIds = (node: FileSystemTree) => {
      for (const key in node) {
        const entry = node[key];
        if ('file' in entry && 'contents' in entry.file) {
          const contents = entry.file.contents;
          if (typeof contents === 'string' && (key.endsWith('.tsx') || key.endsWith('.jsx'))) {
            entry.file.contents = injectDataIds(contents);
          }
        } else if ('directory' in entry) {
          injectIds(entry.directory);
        }
      }
    };

    // Deep clone to avoid mutating the original tree reference unexpectedly
    // Use structuredClone to safely handle binary data (Uint8Array)
    const treeClone = structuredClone(tree);
    injectIds(treeClone);

    await container.mount(treeClone);
    await webContainerService.configureShadcn();
    return treeClone;
  };

  const uploadZip = async (file: File): Promise<FileSystemTree | undefined> => {
    if (!container) return;

    try {
      setIsLoading(true);
      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      const tree: FileSystemTree = {};

      // Helper to ensure directory structure
      const ensureDir = (currentTree: FileSystemTree, pathParts: string[]) => {
        let current = currentTree;
        for (const part of pathParts) {
            if (!current[part]) {
                current[part] = { directory: {} };
            }
            const node = current[part];
            if ('directory' in node) {
                current = node.directory;
            } else {
                // If it's a file, we can't create a directory here.
                throw new Error(`Path collision: ${part} is already a file`);
            }
        }
        return current;
      };

      for (const [path, zipEntry] of Object.entries(content.files)) {
        if (zipEntry.dir) continue;
        // Ignore __MACOSX and .DS_Store
        if (path.includes('__MACOSX') || path.includes('.DS_Store')) continue;

        const parts = path.split('/');
        const fileName = parts.pop()!;
        const dir = ensureDir(tree, parts);

        let fileContent = await zipEntry.async('string');

        // Injection: Add script to index.html
        if (fileName === 'index.html') {
             if (fileContent.includes('</body>')) {
                 fileContent = fileContent.replace(
                     '</body>',
                     '\n    <script type="module" src="/preview-client.js"></script>\n  </body>'
                 );
             } else {
                 fileContent += '\n<script type="module" src="/preview-client.js"></script>';
             }
        }

        // Injection: Add IDs to TSX/JSX
        if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
            fileContent = injectDataIds(fileContent);
        }

        dir[fileName] = {
          file: {
            contents: fileContent,
          },
        };
      }

      // Inject preview-client.js manually to the root
      tree['preview-client.js'] = {
          file: {
              contents: PREVIEW_CLIENT_SCRIPT
          }
      };

      await container.mount(tree);
      await webContainerService.configureShadcn();
      setIsLoading(false);
      return tree;

    } catch (err) {
      console.error('Error processing zip:', err);
      setError(err instanceof Error ? err : new Error('Failed to upload zip'));
      setIsLoading(false);
    }
  };

  const installDependency = async (packageName: string, onOutput?: (data: string) => void) => {
    if (!container) return;
    try {
      const process = await container.spawn('npm', ['install', packageName]);
      process.output.pipeTo(new WritableStream({
        write(data) {
          if (onOutput) onOutput(data);
        }
      }));
      await process.exit;
    } catch (err) {
      console.error('Failed to install dependency:', err);
      if (onOutput) onOutput(`\r\nError installing ${packageName}: ${err}\r\n`);
    }
  };

  return { container, isLoading, error, uploadZip, installDependency, mountFileTree };
}
