import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface InspectorPanelProps {
  selectedElement: { tagName: string; className?: string } | null;
  onUpdateStyle: (newClassName: string) => void;
}

export function InspectorPanel({ selectedElement, onUpdateStyle }: InspectorPanelProps) {
  const [className, setClassName] = useState('');

  useEffect(() => {
    if (selectedElement) {
      setClassName(selectedElement.className || '');
    }
  }, [selectedElement]);

  const updateClass = (newClass: string) => {
    setClassName(newClass);
    onUpdateStyle(newClass);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    // Append arbitrary value class
    const newCls = `${className} text-[${color}]`.trim();
    updateClass(newCls);
  };

  const handleBgColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const color = e.target.value;
      const newCls = `${className} bg-[${color}]`.trim();
      updateClass(newCls);
  };

  const handleMargin = (direction: 'top' | 'bottom' | 'left' | 'right') => {
     const prefix = direction === 'top' ? 'mt' : direction === 'bottom' ? 'mb' : direction === 'left' ? 'ml' : 'mr';
     const newCls = `${className} ${prefix}-[10px]`.trim();
     updateClass(newCls);
  };

  if (!selectedElement) return null;

  return (
    <div className="absolute top-20 right-4 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4 flex flex-col gap-4 z-50 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="font-semibold text-sm text-gray-700">Inspector</h3>
        <span className="text-xs font-mono bg-red-100 text-red-700 px-2 py-1 rounded uppercase">
            {selectedElement.tagName}
        </span>
      </div>

      {/* Colors */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Colors</label>
        <div className="flex gap-2">
            <div className="flex flex-col gap-1 w-1/2">
                <span className="text-[10px] text-gray-400">Text</span>
                <div className="relative">
                  <input
                      type="color"
                      className="w-full h-8 cursor-pointer rounded border border-gray-200 p-0.5"
                      onChange={handleColorChange}
                  />
                </div>
            </div>
             <div className="flex flex-col gap-1 w-1/2">
                <span className="text-[10px] text-gray-400">Background</span>
                <input
                    type="color"
                    className="w-full h-8 cursor-pointer rounded border border-gray-200 p-0.5"
                    onChange={handleBgColorChange}
                />
            </div>
        </div>
      </div>

      {/* Margins */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Margin (+10px)</label>
        <div className="flex flex-col items-center gap-1 bg-gray-50 p-2 rounded">
             <button onClick={() => handleMargin('top')} className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"><ArrowUp size={16} /></button>
             <div className="flex gap-2">
                 <button onClick={() => handleMargin('left')} className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"><ArrowLeft size={16} /></button>
                 <button onClick={() => handleMargin('right')} className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"><ArrowRight size={16} /></button>
             </div>
             <button onClick={() => handleMargin('bottom')} className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"><ArrowDown size={16} /></button>
        </div>
      </div>

      {/* Tailwind Input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Classes</label>
        <textarea
            value={className}
            onChange={(e) => updateClass(e.target.value)}
            className="w-full h-24 text-xs p-2 border border-gray-300 rounded font-mono bg-white resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-gray-800"
            placeholder="Tailwind classes..."
        />
      </div>
    </div>
  );
}
