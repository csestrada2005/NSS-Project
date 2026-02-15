import type { FileSystemTree, FileNode, DirectoryNode } from '@webcontainer/api';
import { applyGitPatch } from '../utils/patchUtils';
import { createPatch } from 'diff';

export class JulesClient {
  static async syncAndSolve(userPrompt: string, currentFileTree: FileSystemTree): Promise<FileSystemTree> {
    console.log('JulesClient: Starting syncAndSolve...');

    // 1. Push (Mock)
    console.log('JulesClient: Pushing code to shadow branch...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Solve (Mock)
    console.log('JulesClient: Triggering Jules session...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Pull (Mock patch)
    // In a real scenario, this would come from the server.
    // Here we generate a patch dynamically to ensure it applies cleanly to the current file state.
    console.log('JulesClient: Pulling solution patch...');

    let oldContent = '';
    // Helper to find App.tsx content
    const findFile = (tree: FileSystemTree, path: string): string | null => {
        const parts = path.split('/');
        let current: any = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current) return null;

            const node = current[part];
            if (!node) return null;

            if ('file' in node) {
                 if (i === parts.length - 1) {
                     const contents = node.file.contents;
                     return typeof contents === 'string' ? contents : new TextDecoder().decode(contents);
                 }
                 return null; // File in middle of path
            } else if ('directory' in node) {
                 current = node.directory;
            } else {
                 return null;
            }
        }
        return null;
    };

    const appContent = findFile(currentFileTree, 'src/App.tsx');
    if (appContent) {
        oldContent = appContent;
    } else {
        console.warn('JulesClient: src/App.tsx not found for mocking.');
        return currentFileTree;
    }

    const newContent = `// Jules Edit: ${userPrompt}\n` + oldContent;

    // Generate a valid patch
    const patch = createPatch('src/App.tsx', oldContent, newContent);

    console.log('JulesClient: Generated mock patch:', patch);

    // 4. Apply using patchUtils
    console.log('JulesClient: Applying patch...');
    try {
        const newTree = applyGitPatch(currentFileTree, patch);
        console.log('JulesClient: Patch applied successfully.');
        return newTree;
    } catch (error) {
        console.error('JulesClient: Failed to apply patch.', error);
        throw error;
    }
  }
}
