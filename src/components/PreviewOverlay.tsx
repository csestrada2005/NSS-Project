import { useEffect, useState, useRef, type RefObject } from 'react';
import Moveable from 'react-moveable';
import { Edit2, ArrowUp } from 'lucide-react';

interface ElementInfo {
  tagName: string;
  className?: string;
  innerText?: string;
  hasChildren?: boolean;
  dataOid?: string;
}

interface PreviewOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onElementSelect: (element: ElementInfo) => void;
  editMode: 'interaction' | 'visual' | 'code';
  onUpdateStyle: (newStyles: Record<string, string>) => void;
  onUpdateText?: (newText: string) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Helper to extract translation values from Tailwind classes
const getTranslateFromClass = (className?: string): { x: number, y: number } => {
    if (!className) return { x: 0, y: 0 };

    const xMatch = className.match(/translate-x-\[(-?\d+)px\]/);
    const yMatch = className.match(/translate-y-\[(-?\d+)px\]/);

    let x = xMatch ? parseInt(xMatch[1], 10) : 0;
    let y = yMatch ? parseInt(yMatch[1], 10) : 0;

    return { x, y };
};

export function PreviewOverlay({ iframeRef, onElementSelect, editMode, onUpdateStyle, onUpdateText }: PreviewOverlayProps) {
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null);
  const proxyRef = useRef<HTMLDivElement>(null);

  const [selectedElementInfo, setSelectedElementInfo] = useState<ElementInfo | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [textValue, setTextValue] = useState('');

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
      if (event.data?.type === 'element-clicked' || event.data?.type === 'element-selected-response') {
        setSelectedRect(event.data.rect);
        const info = {
            tagName: event.data.tagName,
            className: event.data.className,
            innerText: event.data.innerText,
            hasChildren: event.data.hasChildren,
            dataOid: event.data.dataOid
        };
        setSelectedElementInfo(info);
        onElementSelect(info);
        setIsEditingText(false);
      }

      // Handle hover
      if (event.data?.type === 'element-hovered' || event.data?.type === 'element-response') {
        setHoveredRect(event.data.rect);
        setHoveredElement({
            tagName: event.data.tagName,
            className: event.data.className,
            dataOid: event.data.dataOid
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onElementSelect]);

  // Handle Parent Selection via Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && selectedRect && iframeRef.current && !isEditingText) {
            iframeRef.current.contentWindow?.postMessage({
                type: 'select-parent'
            }, '*');
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRect, iframeRef, isEditingText]);

  const handleDragEnd = (e: any) => {
    const { lastEvent } = e;
    if (lastEvent) {
        const { translate } = lastEvent;
        const [dx, dy] = translate;
        const tdx = Math.round(dx);
        const tdy = Math.round(dy);

        if (tdx !== 0 || tdy !== 0) {
             // Get existing translate from class to add delta
             const { x: currentX, y: currentY } = getTranslateFromClass(selectedElementInfo?.className);

             const newX = currentX + tdx;
             const newY = currentY + tdy;

             onUpdateStyle({
                 transform: `translate-x-[${newX}px] translate-y-[${newY}px]`
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

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (editMode !== 'visual' || !iframeRef.current) return;
    const rect = iframeRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    iframeRef.current.contentWindow?.postMessage({
      type: 'get-element-at',
      x,
      y
    }, '*');
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (editMode !== 'visual' || !iframeRef.current) return;
    if (isEditingText) return; // Don't trigger selection if editing text

    const rect = iframeRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    iframeRef.current.contentWindow?.postMessage({
      type: 'find-element-at-point',
      x,
      y
    }, '*');
  };

  const startTextEdit = () => {
      if (selectedElementInfo?.innerText) {
          setTextValue(selectedElementInfo.innerText);
          setIsEditingText(true);
      }
  };

  const handleTextSave = () => {
      if (onUpdateText && selectedElementInfo) {
          onUpdateText(textValue);
          // Optimistically update
          setSelectedElementInfo({ ...selectedElementInfo, innerText: textValue });
      }
      setIsEditingText(false);
  };

  if (editMode !== 'visual') return null;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
      {/* Glass Pane for Interaction Interception */}
      <div
        className={`absolute inset-0 pointer-events-auto bg-transparent ${isEditingText ? '' : 'cursor-crosshair'}`}
        onMouseMove={handleOverlayMouseMove}
        onClick={handleOverlayClick}
      />

      {/* Hover Effect */}
      {hoveredRect && !selectedRect && (
        <div
          className="absolute border-2 border-red-400 border-dashed bg-red-400/5 transition-all duration-75 ease-out"
          style={{
            top: hoveredRect.top,
            left: hoveredRect.left,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        >
          {hoveredElement && (
            <div className="absolute -top-6 left-0 bg-red-400 text-white text-xs px-1.5 py-0.5 rounded shadow-sm font-mono whitespace-nowrap z-50">
              {hoveredElement.tagName}
            </div>
          )}
        </div>
      )}

      {/* Selection Proxy & Moveable */}
      {selectedRect && (
          <>
            {isEditingText ? (
                <textarea
                    className="absolute z-[100] p-1 resize-none bg-white text-black border-2 border-red-500 rounded shadow-lg pointer-events-auto focus:outline-none"
                    style={{
                        top: selectedRect.top,
                        left: selectedRect.left,
                        width: Math.max(selectedRect.width, 100),
                        height: Math.max(selectedRect.height, 40),
                        fontSize: '14px',
                        lineHeight: '1.2'
                    }}
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onBlur={handleTextSave}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleTextSave();
                        }
                        if (e.key === 'Escape') {
                            setIsEditingText(false);
                        }
                    }}
                />
            ) : (
                <>
                    <div
                        ref={proxyRef}
                        className="absolute border-2 border-red-600 bg-red-600/10 pointer-events-auto box-border group"
                        style={{
                            top: selectedRect.top,
                            left: selectedRect.left,
                            width: selectedRect.width,
                            height: selectedRect.height,
                        }}
                    >
                         {/* Edit Text Button - Only if no children (text node) */}
                         {selectedElementInfo && !selectedElementInfo.hasChildren && (
                             <button
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     startTextEdit();
                                 }}
                                 className="absolute -top-3 -right-3 p-1.5 bg-red-600 text-white rounded-full shadow hover:bg-red-700 transition-colors pointer-events-auto z-[60] opacity-0 group-hover:opacity-100"
                                 title="Edit Text"
                             >
                                 <Edit2 size={12} />
                             </button>
                         )}

                         {/* Parent Selection UI Hint */}
                         <button
                             onClick={(e) => {
                                 e.stopPropagation();
                                 iframeRef.current?.contentWindow?.postMessage({ type: 'select-parent' }, '*');
                             }}
                             className="absolute -bottom-6 left-0 flex items-center gap-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow hover:bg-red-700 transition-colors pointer-events-auto z-[60] opacity-0 group-hover:opacity-100"
                             title="Select Parent (Esc)"
                         >
                             <ArrowUp size={10} />
                             Parent (Esc)
                         </button>
                    </div>
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
          </>
      )}
    </div>
  );
}
