import { useEffect, useState, type RefObject } from 'react';

interface ElementInfo {
  tagName: string;
  className?: string;
}

interface PreviewOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onElementSelect: (element: ElementInfo) => void;
  editMode: 'interaction' | 'visual';
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function PreviewOverlay({ iframeRef, onElementSelect, editMode }: PreviewOverlayProps) {
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null);

  // Send editMode to iframe when it changes
  useEffect(() => {
    const sendMode = () => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'set-mode',
                mode: editMode
            }, '*');
        }
    };

    // Initial send
    sendMode();

    // Resend periodically or on iframe load to ensure it sticks
    // Using a simple interval as a fallback for iframe reloads
    const interval = setInterval(sendMode, 1000);

    return () => clearInterval(interval);
  }, [editMode, iframeRef]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Handle click (selection) from iframe script
      if (event.data?.type === 'element-clicked') {
        onElementSelect({
          tagName: event.data.tagName,
          className: event.data.className
        });
      }

      // Handle hover from iframe script
      if (event.data?.type === 'element-hovered') {
        setHighlightRect(event.data.rect);
        setHoveredElement({
            tagName: event.data.tagName,
            className: event.data.className
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onElementSelect]);

  // If not visual mode, we render nothing (let clicks fall through to iframe)
  // EXCEPT: If we want to capture clicks for selection, the iframe script does it.
  // The overlay is only for drawing the highlight box.
  if (editMode !== 'visual') return null;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {highlightRect && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-500/10 transition-all duration-75 ease-out"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        >
          {hoveredElement && (
            <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded shadow-sm font-mono whitespace-nowrap z-50">
              {hoveredElement.tagName}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
