import { parsePatch, applyPatch } from 'diff';
import type { FileSystemTree, DirectoryNode, FileNode } from '@webcontainer/api';

export const applyGitPatch = (tree: FileSystemTree, patch: string): FileSystemTree => {
  const newTree = JSON.parse(JSON.stringify(tree)); // Deep copy
  const patches = parsePatch(patch);

  for (const p of patches) {
    // Determine file path. Git diffs usually start with a/ and b/ prefixes.
    // parsePatch usually preserves them or we handle them.
    // If it's a new file, oldFileName might be /dev/null

    let filePath = p.newFileName || p.oldFileName;
    if (!filePath) continue;

    // Remove a/ or b/ prefix if present (standard git diff)
    filePath = filePath.replace(/^[ab]\//, '');

    if (filePath === '/dev/null') continue;

    const parts = filePath.split('/');
    let currentLevel = newTree;
    const fileName = parts[parts.length - 1];

    // Navigate to directory
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!currentLevel[part]) {
        // Create directory if not exists
        currentLevel[part] = { directory: {} };
      }

      const node = currentLevel[part] as any;
      if ('directory' in node) {
         currentLevel = (node as DirectoryNode).directory;
      } else {
         // Overwrite file with directory if conflict? Ideally shouldn't happen in valid patch
         console.warn(`Path conflict: ${part} is a file but expected directory.`);
         currentLevel[part] = { directory: {} };
         currentLevel = (currentLevel[part] as DirectoryNode).directory;
      }
    }

    // Get content
    let oldContent = '';
    const node = currentLevel[fileName];
    if (node && 'file' in (node as any)) {
        const fileNode = node as FileNode;
        if (typeof fileNode.file.contents === 'string') {
            oldContent = fileNode.file.contents;
        } else {
            oldContent = new TextDecoder().decode(fileNode.file.contents);
        }
    } else if (node && 'directory' in (node as any)) {
        console.warn(`Path conflict: ${fileName} is a directory but expected file.`);
        continue;
    }

    // Apply patch
    const newContent = applyPatch(oldContent, p);

    if (newContent === false) {
        console.warn(`Failed to apply patch to ${filePath}`);
        continue;
    }

    // Update tree
    currentLevel[fileName] = {
        file: {
            contents: newContent
        }
    };
  }

  return newTree;
};
