import React, { useState } from 'react';
import { File, Folder, ChevronRight, ChevronDown, Plus } from 'lucide-react';

interface FileExplorerProps {
  files: Map<string, string>;
  onSelect: (path: string) => void;
  onAddPackage?: (packageName: string) => void;
}

// ---------------------------------------------------------------------------
// Tree node representation derived from flat Map paths
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

function buildTree(files: Map<string, string>): TreeNode[] {
  const root: Record<string, TreeNode> = {};

  const getOrCreate = (segments: string[], fullParts: string[]): TreeNode => {
    const key = fullParts.slice(0, segments.length).join('/');
    if (!root[key]) {
      root[key] = {
        name: segments[segments.length - 1],
        path: key,
        isDirectory: true,
        children: [],
      };
    }
    return root[key];
  };

  // Sort paths for deterministic order
  const sortedPaths = Array.from(files.keys()).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/');
    // Ensure all ancestor directories exist
    for (let depth = 1; depth < parts.length; depth++) {
      getOrCreate(parts.slice(0, depth), parts);
    }
    // Add the file leaf
    root[filePath] = {
      name: parts[parts.length - 1],
      path: filePath,
      isDirectory: false,
      children: [],
    };
  }

  // Wire up parent → children relationships
  for (const [key, node] of Object.entries(root)) {
    const parts = key.split('/');
    if (parts.length > 1) {
      const parentKey = parts.slice(0, -1).join('/');
      if (root[parentKey]) {
        root[parentKey].children.push(node);
      }
    }
  }

  // Return only top-level nodes, sorted (dirs first, then files)
  return Object.values(root)
    .filter(n => !n.path.includes('/'))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

// ---------------------------------------------------------------------------
// Recursive tree node component
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
}

const TreeNodeItem: React.FC<TreeNodeProps> = ({ node, depth, onSelect }) => {
  const [isOpen, setIsOpen] = useState(depth === 0);

  const handleClick = () => {
    if (node.isDirectory) {
      setIsOpen(v => !v);
    } else {
      onSelect(node.path);
    }
  };

  const sortedChildren = [...node.children].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-accent cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <span className="text-muted-foreground">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="w-3.5" />
        )}

        {node.isDirectory ? (
          <Folder size={14} className="text-primary" />
        ) : (
          <File size={14} className="text-muted-foreground" />
        )}

        <span className="text-sm truncate">{node.name}</span>
      </div>

      {node.isDirectory && isOpen && (
        <div>
          {sortedChildren.map(child => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FileExplorer
// ---------------------------------------------------------------------------

export const FileExplorer: React.FC<FileExplorerProps> = ({ files, onSelect, onAddPackage }) => {
  const handleAddPackage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const pkg = window.prompt('Enter npm package name (e.g. framer-motion):');
    if (pkg && onAddPackage) {
      onAddPackage(pkg);
    }
  };

  const tree = buildTree(files);

  return (
    <div className="h-full bg-background overflow-y-auto border-r border-border flex flex-col">
      <div className="p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider border-b border-border flex justify-between items-center">
        <span>Explorer</span>
        {onAddPackage && (
          <button
            onClick={handleAddPackage}
            className="hover:text-foreground transition-colors p-1 rounded hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            title="Install npm package"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 py-2">
        {tree.map(node => (
          <TreeNodeItem key={node.path} node={node} depth={0} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
};
