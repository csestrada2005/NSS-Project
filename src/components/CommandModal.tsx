import { motion } from "framer-motion";
import { X, MessageSquare, TerminalSquare } from "lucide-react";
import { modalBackdropMotion, bottomSheetMotion } from "@/components/ui/modalMotion";

// Rediseño del navbar del preview (bucket 5 ítem 3, 2026-09-20): Visual/
// Código/Navegar se promovieron a PreviewNavbar (persistente arriba del
// preview) — CommandModal se quedó sólo con lo que de verdad necesita ser un
// modal flotante: Chat (con el look de vidrio esmerilado sobre el preview en
// vivo) y Terminal (los logs de compilación con colores ANSI).
type TabType = "chat" | "terminal";

interface CommandModalProps {
  onClose: () => void;
  children: React.ReactNode;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const CommandModal = ({ onClose, children, activeTab, setActiveTab }: CommandModalProps) => {
  // SÓLO la pestaña Chat flota translúcida con blur sobre el preview en vivo,
  // mismo look del mockup (https://claude.ai/artifact/HYr28WtZvQhstgWGEwMwWX)
  // — Terminal se queda como hoja sólida bg-card. El riesgo conocido es
  // backdrop-filter sobre el iframe del preview mientras recompila; si se
  // siente pesado, el primer candidato a quitar es el blur del historial
  // (HistoryOverlay), no esta capa base.
  const isChatTab = activeTab === 'chat';

  return (
    <>
      <motion.div
        {...modalBackdropMotion}
        className={`fixed inset-0 z-[60] ${isChatTab ? '' : 'bg-black/40 backdrop-blur-sm'}`}
        onClick={onClose}
      />
      <div className="fixed z-[70] inset-x-4 bottom-4 h-[88vh] max-h-[920px]">
      <motion.div
        {...bottomSheetMotion}
        className={`h-full rounded-2xl flex flex-col overflow-hidden ${
          isChatTab ? 'border-0 bg-transparent shadow-none' : 'border border-border bg-card shadow-2xl'
        }`}
      >
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
               onClick={() => setActiveTab('terminal')}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'terminal' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
             >
               <TerminalSquare size={16} />
               Terminal
             </button>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className={`flex-1 overflow-hidden relative flex flex-col ${isChatTab ? 'bg-transparent' : 'bg-card'}`}>
          <div className="flex-1 overflow-hidden">
             {children}
          </div>
        </div>
      </motion.div>
      </div>
    </>
  );
};
