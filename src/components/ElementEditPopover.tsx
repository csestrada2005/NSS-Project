import { useState, useEffect } from "react";
import { X, Type, Palette } from "lucide-react";

interface ElementEditPopoverProps {
  element: {
    tagName: string;
    innerText?: string;
    className?: string;
  };
  onUpdateText: (newText: string) => void;
  onUpdateStyle: (newStyles: Record<string, string>) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export const ElementEditPopover = ({ element, onUpdateText, onUpdateStyle, onClose, position }: ElementEditPopoverProps) => {
  const [mode, setMode] = useState<"choose" | "text" | "color">("choose");
  const [textValue, setTextValue] = useState(element.innerText || "");

  // Naively parsing bg-color and text-color from className
  const [colorValue, setColorValue] = useState("");
  const [bgColorValue, setBgColorValue] = useState("");

  useEffect(() => {
    setTextValue(element.innerText || "");

    const classes = (element.className || "").split(" ");
    const textCls = classes.find((c) => c.startsWith("text-["));
    const bgCls = classes.find((c) => c.startsWith("bg-["));

    if (textCls) setColorValue(textCls.replace("text-[", "").replace("]", ""));
    else setColorValue("");

    if (bgCls) setBgColorValue(bgCls.replace("bg-[", "").replace("]", ""));
    else setBgColorValue("");
  }, [element]);

  const handleTextSave = () => {
    onUpdateText(textValue);
    setMode("choose");
  };

  const handleColorSave = () => {
    const newStyles: Record<string, string> = {};
    if (colorValue) newStyles.color = `text-[${colorValue}]`;
    if (bgColorValue) newStyles.bgColor = `bg-[${bgColorValue}]`;
    onUpdateStyle(newStyles);
    setMode("choose");
  };

  return (
    <div
      className="absolute z-[100] rounded-xl border border-gray-700 bg-gray-900 shadow-xl overflow-hidden min-w-[200px]"
      style={{
        top: position.top + 10,
        left: position.left,
      }}
    >
      <div className="flex justify-between items-center border-b border-gray-800 p-2 bg-gray-950">
        <span className="text-xs font-semibold text-gray-300 px-1">
          Edit {element.tagName}
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3 bg-gray-900">
        {mode === "choose" && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setMode("text")}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded transition-colors"
            >
              <Type size={16} className="text-red-400" />
              Edit Text
            </button>
            <button
              onClick={() => setMode("color")}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded transition-colors"
            >
              <Palette size={16} className="text-red-400" />
              Edit Color
            </button>
          </div>
        )}

        {mode === "text" && (
          <div className="flex flex-col gap-3">
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              className="w-full h-24 p-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 resize-none focus:outline-none focus:border-red-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMode("choose")}
                className="px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleTextSave}
                className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {mode === "color" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorValue || '#ffffff'}
                  onChange={(e) => setColorValue(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-700 p-0.5 bg-gray-900"
                />
                <span className="text-xs text-gray-400 font-mono">
                  {colorValue || '#ffffff'}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Background Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColorValue || '#ffffff'}
                  onChange={(e) => setBgColorValue(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-700 p-0.5 bg-gray-900"
                />
                <span className="text-xs text-gray-400 font-mono">
                  {bgColorValue || '#ffffff'}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setMode("choose")}
                className="px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleColorSave}
                className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};