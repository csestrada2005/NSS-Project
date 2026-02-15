import React, { useState } from 'react';
import { File, Folder, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import type { FileSystemTree, DirectoryNode, FileNode, SymlinkNode } from '@webcontainer/api';

interface FileExplorerProps {
  fileTree: FileSystemTree;
  onSelect: (path: string) => void;
  onAddPackage?: (packageName: string) => void;
}

interface FileNodeProps {
  name: string;
  node: FileNode | DirectoryNode | SymlinkNode;
  path: string;
  depth: number;
  onSelect: (path: string) => void;
}

const FileSystemNode: React.FC<FileNodeProps> = ({ name, node, path, depth, onSelect }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isDirectory = 'directory' in node;

  // Handling Symlinks if needed, but usually just skip or treat as files
  const isSymlink = 'symlink' in node;

  const handleClick = () => {
    if (isDirectory) {
      setIsOpen(!isOpen);
    } else if (!isSymlink) {
      onSelect(path);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 hover:bg-gray-800 cursor-pointer select-none text-gray-300 hover:text-white transition-colors`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory && (
          <span className="text-gray-500">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {!isDirectory && <span className="w-3.5" />} {/* Spacer for alignment */}

        {isDirectory ? (
          <Folder size={14} className="text-blue-400" />
        ) : (
          <File size={14} className="text-gray-400" />
        )}

        <span className="text-sm truncate">{name}</span>
      </div>

      {isDirectory && isOpen && (
        <div>
          {Object.entries((node as DirectoryNode).directory).map(([childName, childNode]) => (
            <FileSystemNode
              key={childName}
              name={childName}
              node={childNode}
              path={`${path}/${childName}`}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({ fileTree, onSelect, onAddPackage }) => {
  const handleAddPackage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const pkg = window.prompt('Enter npm package name (e.g. framer-motion):');
    if (pkg && onAddPackage) {
        onAddPackage(pkg);
    }
  };

  return (
    <div className="h-full bg-gray-900 overflow-y-auto border-r border-gray-800 flex flex-col">
      <div className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 flex justify-between items-center">
        <span>Explorer</span>
        {onAddPackage && (
            <button
                onClick={handleAddPackage}
                className="hover:text-white transition-colors p-1 rounded hover:bg-gray-800"
                title="Install npm package"
            >
                <Plus size={14} />
            </button>
        )}
      </div>
      <div className="flex-1 py-2">
        {Object.entries(fileTree).map(([name, node]) => (
          <FileSystemNode
            key={name}
            name={name}
            node={node}
            path={name} // Start path with filename/dirname at root
            depth={0}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};
