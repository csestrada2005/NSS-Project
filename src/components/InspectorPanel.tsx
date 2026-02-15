import { useState } from 'react';

interface InspectorPanelProps {
  selectedElement: { tagName: string; className?: string } | null;
  onUpdateClass: (newClassName: string) => void;
}

export function InspectorPanel({ selectedElement, onUpdateClass }: InspectorPanelProps) {
  const [className, setClassName] = useState(selectedElement?.className || '');
  const [prevSelectedElement, setPrevSelectedElement] = useState<InspectorPanelProps['selectedElement']>(selectedElement);

  // Update local state when selectedElement changes
  if (selectedElement !== prevSelectedElement) {
    setClassName(selectedElement?.className || '');
    setPrevSelectedElement(selectedElement);
  }

  const handleUpdate = () => {
    onUpdateClass(className);
  };

  if (!selectedElement) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 p-4 text-center">
        Select an element to edit
      </div>
    );
  }

  const isUnchanged = className === (selectedElement.className || '');

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-200">
          Properties: <span className="text-blue-400 font-mono">{selectedElement.tagName.toLowerCase()}</span>
        </h2>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="space-y-2">
          <label htmlFor="tailwind-classes" className="block text-xs font-medium text-gray-400">
            Tailwind Classes
          </label>
          <textarea
            id="tailwind-classes"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="w-full h-32 bg-gray-950 border border-gray-800 rounded-md p-3 text-sm font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors placeholder-gray-600"
            placeholder="e.g. flex items-center justify-center..."
            spellCheck={false}
          />
          <button
            onClick={handleUpdate}
            disabled={isUnchanged}
            className={`w-full py-2 rounded-md text-white font-medium transition-colors ${
              isUnchanged
                ? 'bg-blue-600/50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
