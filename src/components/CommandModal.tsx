import { X, MessageSquare, MousePointer2, Code2, Edit3 } from "lucide-react";

type TabType = "chat" | "visual" | "code";

interface CommandModalProps {
  onClose: () => void;
  visualEditMode: boolean;
  onToggleVisualEdit: (active: boolean) => void;
  children: React.ReactNode;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const CommandModal = ({ onClose, visualEditMode, onToggleVisualEdit, children, activeTab, setActiveTab }: CommandModalProps) => {

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-[70] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[800px] h-[75vh] max-h-[700px] rounded-2xl border border-gray-800 flex flex-col bg-gray-900 shadow-2xl overflow-hidden">
        {/* Header Tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/50 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-800/50 border border-gray-800">
             <button
               onClick={() => setActiveTab('chat')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'chat' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
             >
               <MessageSquare size={16} />
               Chat
             </button>
             <button
               onClick={() => setActiveTab('visual')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'visual' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
             >
               <MousePointer2 size={16} />
               Visual
             </button>
             <button
               onClick={() => setActiveTab('code')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'code' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
             >
               <Code2 size={16} />
               Code
             </button>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-gray-900">
          {activeTab === 'visual' && (
             <div className="p-4 border-b border-gray-800 bg-gray-950 shrink-0">
               <div className="flex items-center justify-between">
                 <div>
                    <h3 className="text-sm font-medium text-white">Visual Edit Mode</h3>
                    <p className="text-xs text-gray-400 mt-1">Select elements on the canvas to change their text, color, and properties directly.</p>
                 </div>
                 <button
                    onClick={() => onToggleVisualEdit(!visualEditMode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${visualEditMode ? 'bg-red-600' : 'bg-gray-700'}`}
                 >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${visualEditMode ? 'translate-x-6' : 'translate-x-1'}`} />
                 </button>
               </div>
               {visualEditMode && (
                   <div className="mt-4 p-3 bg-red-950/20 border border-red-900/30 rounded-lg flex items-start gap-2 text-xs text-red-200">
                      <Edit3 size={14} className="mt-0.5 shrink-0 text-red-400" />
                      <p>Visual Mode is active. Click anywhere on the preview to select an element, or hold Shift to drag it. Press Esc to select its parent.</p>
                   </div>
               )}
             </div>
          )}

          <div className="flex-1 overflow-hidden">
             {children}
          </div>
        </div>
      </div>
    </>
  );
};
