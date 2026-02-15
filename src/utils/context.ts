import type { FileSystemTree, DirectoryNode, FileNode } from '@webcontainer/api';

const flattenFileTreeRecursive = (tree: FileSystemTree, pathPrefix = ''): string => {
  let output = '';

  for (const [name, node] of Object.entries(tree)) {
    // Skip node_modules and .git to save tokens
    if (name === 'node_modules' || name === '.git') {
      continue;
    }

    const currentPath = pathPrefix ? `${pathPrefix}/${name}` : name;

    if ('file' in node) {
      const fileNode = node as FileNode;
      if ('contents' in fileNode.file) {
        const content = typeof fileNode.file.contents === 'string'
          ? fileNode.file.contents
          : new TextDecoder().decode(fileNode.file.contents);

        output += `<document path="${currentPath}">\n${content}\n</document>\n`;
      }
    } else if ('directory' in node) {
      const directoryNode = node as DirectoryNode;
      output += flattenFileTreeRecursive(directoryNode.directory, currentPath);
    }
  }

  return output;
};

export const flattenFileTree = (tree: FileSystemTree): string => {
  const documents = flattenFileTreeRecursive(tree);
  return `<documents>\n${documents}</documents>`;
};
