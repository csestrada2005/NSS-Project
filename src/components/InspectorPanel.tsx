import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { type TargetElement, extractComponentProps, type PropDef } from '../utils/ast';
import type { FileSystemTree } from '@webcontainer/api';

interface InspectorPanelProps {
  selectedElement: TargetElement | null;
  onUpdateStyle: (newClassName: string) => void;
  onUpdateProp?: (name: string, value: string | boolean | number) => void;
  fileTree?: FileSystemTree;
}

export function InspectorPanel({ selectedElement, onUpdateStyle, onUpdateProp, fileTree }: InspectorPanelProps) {
  const [className, setClassName] = useState('');
  const [propValues, setPropValues] = useState<Record<string, any>>({});
  const [availableProps, setAvailableProps] = useState<PropDef[]>([]);

  useEffect(() => {
    if (selectedElement) {
      setClassName(selectedElement.className || '');

      if (fileTree) {
          const props = extractComponentProps(fileTree, selectedElement.tagName);
          setAvailableProps(props);
          // Initialize values to default for now (can be improved to read from code)
          const initialValues: Record<string, any> = {};
          props.forEach(p => {
              if (p.type === 'boolean') initialValues[p.name] = false;
              if (p.type === 'string') initialValues[p.name] = '';
              if (p.type === 'number') initialValues[p.name] = 0;
              if (p.type === 'enum' && p.options && p.options.length > 0) initialValues[p.name] = p.options[0];
          });
          setPropValues(initialValues);
      }
    }
  }, [selectedElement, fileTree]);

  const updateClass = (newClass: string) => {
    setClassName(newClass);
    onUpdateStyle(newClass);
  };

  const handlePropChange = (name: string, value: string | boolean | number) => {
      setPropValues(prev => ({ ...prev, [name]: value }));
      onUpdateProp?.(name, value);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
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
    <div className="absolute top-20 right-4 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4 flex flex-col gap-4 z-50 animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="font-semibold text-sm text-gray-700">Inspector</h3>
        <span className="text-xs font-mono bg-red-100 text-red-700 px-2 py-1 rounded uppercase">
            {selectedElement.tagName}
        </span>
      </div>

      {/* Component Properties */}
      {availableProps.length > 0 && (
          <div className="space-y-3 border-b pb-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Properties</label>
            <div className="flex flex-col gap-3">
                {availableProps.map(prop => (
                    <div key={prop.name} className="flex flex-col gap-1">
                        <span className="text-[10px] text-gray-400 capitalize">{prop.name}</span>
                        {prop.type === 'enum' && prop.options ? (
                             <select
                                value={propValues[prop.name] as string || ''}
                                onChange={(e) => handlePropChange(prop.name, e.target.value)}
                                className="w-full text-xs p-1 border border-gray-200 rounded bg-white text-gray-700 focus:outline-none focus:border-red-500"
                            >
                                {prop.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : prop.type === 'boolean' ? (
                             <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">{prop.name}</span>
                                <input
                                    type="checkbox"
                                    checked={propValues[prop.name] as boolean || false}
                                    onChange={(e) => handlePropChange(prop.name, e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                />
                            </div>
                        ) : (
                             <input
                                type={prop.type === 'number' ? 'number' : 'text'}
                                value={propValues[prop.name] as string | number || ''}
                                onChange={(e) => handlePropChange(prop.name, prop.type === 'number' ? Number(e.target.value) : e.target.value)}
                                className="w-full text-xs p-1 border border-gray-200 rounded bg-white text-gray-700 focus:outline-none focus:border-red-500"
                            />
                        )}
                    </div>
                ))}
            </div>
          </div>
      )}

      {/* Styles Header */}
       <div className="space-y-2">
         <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Styles</label>
         {/* Colors */}
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
