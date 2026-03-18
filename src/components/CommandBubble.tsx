import { Flame } from "lucide-react";

export const CommandBubble = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className="fixed top-[4.5rem] right-6 z-[60] h-12 w-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-red-600 border-2 border-red-500/50"
    >
      <Flame size={20} color="#fff" />
    </button>
  );
};