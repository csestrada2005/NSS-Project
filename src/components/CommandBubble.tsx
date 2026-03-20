import { Flame, Clock } from "lucide-react";

interface CommandBubbleProps {
  onClick: () => void;
  onHistoryClick: () => void;
}

export const CommandBubble = ({ onClick, onHistoryClick }: CommandBubbleProps) => {
  return (
    <div className="fixed bottom-24 lg:top-[4.5rem] lg:bottom-auto right-6 z-[60]">
      {/* History button — small, top-left of the main bubble */}
      <button
        onClick={onHistoryClick}
        title="Version History"
        className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-accent border border-border hover:bg-accent/80 flex items-center justify-center z-[61] transition-colors"
      >
        <Clock size={12} className="text-muted-foreground" />
      </button>

      {/* Main command bubble */}
      <button
        onClick={onClick}
        className="h-11 w-11 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-primary border-2 border-primary/50"
      >
        <Flame size={18} color="#fff" />
      </button>
    </div>
  );
};
