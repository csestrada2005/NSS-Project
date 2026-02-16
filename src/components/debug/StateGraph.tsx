import { useCallback, useEffect } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, addEdge, type Node, type Edge, type Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X } from 'lucide-react';
import { analyzeDependencyGraph } from '../../utils/ast';
import type { FileSystemTree } from '@webcontainer/api';

interface StateGraphProps {
  fileTree: FileSystemTree;
  onClose: () => void;
}

export function StateGraph({ fileTree, onClose }: StateGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = analyzeDependencyGraph(fileTree);

    // Simple layout: Grid
    const columns = Math.ceil(Math.sqrt(newNodes.length));
    newNodes.forEach((node, index) => {
        const x = (index % columns) * 250;
        const y = Math.floor(index / columns) * 150;
        node.position = { x, y };
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [fileTree, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white rounded-lg w-[90vw] h-[90vh] flex flex-col relative overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
             <h2 className="text-xl font-bold text-gray-800">Component Dependency Graph</h2>
             <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="text-gray-600" />
             </button>
        </div>
        <div className="flex-1 w-full h-full text-black bg-gray-50">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
      </div>
    </div>
  );
}
