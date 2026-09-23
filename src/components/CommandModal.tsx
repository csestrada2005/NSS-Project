import { motion } from "framer-motion";
import { X } from "lucide-react";
import { modalBackdropMotion, bottomSheetMotion } from "@/components/ui/modalMotion";

// CommandModal ya sólo es el chat (2026-09-21: se quitó Terminal, que era la
// última otra pestaña — ver QUEUE.md ítem 12). Visual/Código/Navegar se
// habían promovido antes a PreviewNavbar (ítem 11). Sin pestañas que
// conmutar, el modal flota translúcido con blur sobre el preview en vivo
// SIEMPRE, mismo look del mockup
// (https://claude.ai/artifact/HYr28WtZvQhstgWGEwMwWX) — ya no hay una rama
// "pestaña sólida" que mantener. El riesgo conocido es backdrop-filter sobre
// el iframe del preview mientras recompila; si se siente pesado, el primer
// candidato a quitar es el blur del historial (HistoryOverlay), no esta capa
// base.
interface CommandModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /**
   * "Peek" (Ctrl+Espacio con el chat ya abierto, QUEUE.md ítem 5.3 Bloque 6):
   * ChatInterface esconde su typebar/tarjetas para revelar el preview
   * completo, pero este backdrop (invisible — sólo existe para cerrar al
   * hacer click fuera) seguía cubriendo toda la pantalla y bloqueando el
   * scroll/click del preview aunque no se viera nada encima. Con `peeking`,
   * tanto el backdrop como el contenedor del bottom sheet dejan pasar el
   * puntero.
   */
  peeking?: boolean;
}

export const CommandModal = ({ onClose, children, peeking = false }: CommandModalProps) => {
  return (
    <>
      <motion.div
        {...modalBackdropMotion}
        className={`fixed inset-0 z-[60] ${peeking ? 'pointer-events-none' : ''}`}
        onClick={onClose}
      />
      <div className={`fixed z-[70] inset-x-4 bottom-4 h-[88vh] max-h-[920px] ${peeking ? 'pointer-events-none' : ''}`}>
      <motion.div
        {...bottomSheetMotion}
        className="h-full rounded-2xl flex flex-col overflow-hidden border-0 bg-transparent shadow-none"
      >
        <div className="flex items-center justify-end px-4 py-3 shrink-0">
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative flex flex-col bg-transparent">
          <div className="flex-1 overflow-hidden">
             {children}
          </div>
        </div>
      </motion.div>
      </div>
    </>
  );
};
