import { useEffect, useState, useRef, type RefObject } from 'react';
import Moveable from 'react-moveable';

interface ElementInfo {
  tagName: string;
  className?: string;
}

interface PreviewOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onElementSelect: (element: ElementInfo) => void;
  editMode: 'interaction' | 'visual' | 'code';
  onUpdateStyle: (newStyles: Record<string, string>) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function PreviewOverlay({ iframeRef, onElementSelect, editMode, onUpdateStyle }: PreviewOverlayProps) {
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null);
  const proxyRef = useRef<HTMLDivElement>(null);

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

    sendMode();
    const interval = setInterval(sendMode, 1000);
    return () => clearInterval(interval);
  }, [editMode, iframeRef]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Handle click (selection)
      if (event.data?.type === 'element-clicked') {
        setSelectedRect(event.data.rect);
        onElementSelect({
          tagName: event.data.tagName,
          className: event.data.className
        });
      }

      // Handle hover
      if (event.data?.type === 'element-hovered') {
        setHoveredRect(event.data.rect);
        setHoveredElement({
            tagName: event.data.tagName,
            className: event.data.className
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onElementSelect]);

  const handleDragEnd = (e: any) => {
    const { lastEvent } = e;
    if (lastEvent) {
        const { translate } = lastEvent;
        const [x, y] = translate;
        const tx = Math.round(x);
        const ty = Math.round(y);

        if (tx !== 0 || ty !== 0) {
             onUpdateStyle({
                 transform: `translate-x-[${tx}px] translate-y-[${ty}px]`
             });
        }
    }
  };

  const handleResizeEnd = (e: any) => {
    const { lastEvent } = e;
    if (lastEvent) {
         const { width, height } = lastEvent;
         onUpdateStyle({
             dimensions: `w-[${Math.round(width)}px] h-[${Math.round(height)}px]`
         });
    }
  };

  if (editMode !== 'visual') return null;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
      {/* Hover Effect */}
      {hoveredRect && !selectedRect && (
        <div
          className="absolute border-2 border-blue-400 border-dashed bg-blue-400/5 transition-all duration-75 ease-out"
          style={{
            top: hoveredRect.top,
            left: hoveredRect.left,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        >
          {hoveredElement && (
            <div className="absolute -top-6 left-0 bg-blue-400 text-white text-xs px-1.5 py-0.5 rounded shadow-sm font-mono whitespace-nowrap z-50">
              {hoveredElement.tagName}
            </div>
          )}
        </div>
      )}

      {/* Selection Proxy & Moveable */}
      {selectedRect && (
          <>
            <div
                ref={proxyRef}
                className="absolute border-2 border-blue-600 bg-blue-600/10 pointer-events-auto box-border"
                style={{
                    top: selectedRect.top,
                    left: selectedRect.left,
                    width: selectedRect.width,
                    height: selectedRect.height,
                }}
            />
            <Moveable
                target={proxyRef.current}
                draggable={true}
                resizable={true}
                throttleDrag={0}
                throttleResize={0}
                onDrag={({ target, transform }) => {
                    target.style.transform = transform;
                }}
                onDragEnd={handleDragEnd}
                onResize={({ target, width, height, drag }) => {
                    target.style.width = `${width}px`;
                    target.style.height = `${height}px`;
                    target.style.transform = drag.transform;
                }}
                onResizeEnd={handleResizeEnd}
                keepRatio={false}
                renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
            />
          </>
      )}
    </div>
  );
}
