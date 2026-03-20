import { X, MessageSquare, MousePointer2, Edit3, Code } from "lucide-react";

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
      <div className="fixed z-[70] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[900px] h-[75vh] max-h-[700px] rounded-2xl border border-border flex flex-col bg-card shadow-2xl overflow-hidden">
        {/* Header Tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/50 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-accent/50 border border-border">
             <button
               onClick={() => setActiveTab('chat')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'chat' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
             >
               <MessageSquare size={16} />
               Chat
             </button>
             <button
               onClick={() => setActiveTab('visual')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'visual' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
             >
               <MousePointer2 size={16} />
               Visual
             </button>
             <button
               onClick={() => setActiveTab('code')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'code' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
             >
               <Code size={16} />
               Code
             </button>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-card">
          {activeTab === 'visual' && (
             <div className="p-4 border-b border-border bg-background shrink-0">
               <div className="flex items-center justify-between">
                 <div>
                    <h3 className="text-sm font-medium text-foreground">Visual Edit Mode</h3>
                    <p className="text-xs text-muted-foreground mt-1">Select elements on the canvas to change their text, color, and properties directly.</p>
                 </div>
                 <button
                    onClick={() => onToggleVisualEdit(!visualEditMode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${visualEditMode ? 'bg-primary' : 'bg-muted'}`}
                 >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${visualEditMode ? 'translate-x-6' : 'translate-x-1'}`} />
                 </button>
               </div>
               {visualEditMode && (
                   <div className="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-start gap-2 text-xs text-primary">
                      <Edit3 size={14} className="mt-0.5 shrink-0 text-primary" />
                      <p>Visual Mode is active. Click anywhere on the preview to select an element, or hold Shift to drag it. Press Esc to select its parent.</p>
                   </div>
               )}
             </div>
          )}

          {activeTab === 'code' && (
            <div className="p-3 border-b border-border bg-background shrink-0 flex items-start gap-2 text-xs text-muted-foreground">
              <Code size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
              <p>Browse and edit your project files. Click <span className="text-white font-medium">Save &amp; Run</span> to apply changes to the preview.</p>
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
